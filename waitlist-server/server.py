"""Waitlist HTTP endpoint. Stdlib only; layer_forms supplies the envelope.

Submissions are stored PENDING then delivered to Twenty CRM in a daemon thread.
If TWENTY_BASE_URL or TWENTY_API_KEY are absent, delivery is skipped (stays PENDING).
"""

from __future__ import annotations

import hashlib
import fcntl
import json
import os
import re
import sqlite3
import threading
import time
import unicodedata
from collections import deque
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from layer_forms import InvalidSubmissionError, new_submission
from store import SQLiteSubmissionStore
from twenty import TwentyClient, deliver

FORM_KEY = "waitlist"
MAX_BODY = 4 * 1024
RATE_LIMIT = 10
RATE_WINDOW = 60.0
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SOURCE_RE = re.compile(r"^[a-z0-9-]{1,64}$")


@dataclass(frozen=True)
class Config:
    host: str
    port: int
    db_path: str
    origins: frozenset[str]
    allow_no_origin: bool


def load_config(env: Mapping[str, str]) -> Config:
    origins = frozenset(
        o.strip().lower() for o in env.get("WAITLIST_ORIGINS", "").split(",") if o.strip()
    )
    return Config(
        host=env.get("WAITLIST_HOST", "127.0.0.1"),
        port=int(env.get("WAITLIST_PORT", "7400")),
        db_path=env.get("WAITLIST_DB", "./waitlist.sqlite3"),
        origins=origins,
        allow_no_origin=env.get("WAITLIST_ALLOW_NO_ORIGIN") == "1",
    )


class RateLimiter:
    """Sliding window per key. shortcut: stale keys never evicted, fine at waitlist scale."""

    def __init__(
        self,
        limit: int = RATE_LIMIT,
        window: float = RATE_WINDOW,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._limit = limit
        self._window = window
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = self._clock()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= self._window:
                hits.popleft()
            if len(hits) >= self._limit:
                return False
            hits.append(now)
            return True


class _Invalid(Exception):
    def __init__(self, field: str) -> None:
        self.field = field


def _clean_name(value: object) -> str:
    if not isinstance(value, str):
        raise _Invalid("name")
    name = value.strip()
    if not 1 <= len(name) <= 120 or any(unicodedata.category(c) == "Cc" for c in name):
        raise _Invalid("name")
    return name


def _clean_email(value: object) -> str:
    if not isinstance(value, str):
        raise _Invalid("email")
    email = value.strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise _Invalid("email")
    return email


Deliverer = Callable[[str, str], tuple[bool, str | None]]  # (name, email) -> (ok, error)


def deliver_and_record(store: SQLiteSubmissionStore, sub, deliverer: Deliverer) -> None:
    """Deliver one stored submission, then persist the outcome. Never raises."""
    try:
        ok, err = deliverer(sub.payload["name"], sub.payload["email"])
        store.save(sub.record_delivery_success() if ok else sub.record_delivery_failure(err or "unknown"))
        if not ok:
            print(f"waitlist delivery failed: {err or 'unknown'}", flush=True)
    except Exception as exc:  # row remains retryable
        print(f"waitlist delivery failed: {type(exc).__name__}", flush=True)


def deliver_pending(store: SQLiteSubmissionStore, deliverer: Deliverer) -> None:
    # A lock shared by processes prevents concurrent find-or-create attempts.
    with open(store.lock_path, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        after = ""
        while batch := store.undelivered(after):
            for sub in batch:
                deliver_and_record(store, sub, deliverer)
            after = str(batch[-1].submission_id)


def delivery_loop(store: SQLiteSubmissionStore, deliverer: Deliverer) -> None:
    while True:
        try:
            deliver_pending(store, deliverer)
        except Exception as exc:
            print(f"waitlist delivery recovery failed: {type(exc).__name__}", flush=True)
        time.sleep(60)


def _clean_source(value: object) -> str | None:
    """Optional attribution tag. Bad values raise; absent means unattributed."""
    if value is None or value == "":
        return None
    if not isinstance(value, str) or not SOURCE_RE.match(value):
        raise _Invalid("source")
    return value


class Handler(BaseHTTPRequestHandler):
    server_version = "waitlist"
    sys_version = ""

    def do_GET(self) -> None:
        if self.path == "/api/waitlist/health":
            self._json(200, {"ok": True})
        else:
            self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/api/waitlist":
            return self._json(404, {"error": "not_found"})
        cfg = self.server.config  # type: ignore[attr-defined]

        origin = self.headers.get("Origin")
        if origin is None:
            if not cfg.allow_no_origin:
                return self._json(403, {"error": "forbidden_origin"})
        elif origin.strip().lower() not in cfg.origins:
            return self._json(403, {"error": "forbidden_origin"})

        ip = (self.headers.get("X-Real-IP") or self.client_address[0]).strip()
        if not self.server.limiter.allow(ip):  # type: ignore[attr-defined]
            return self._json(429, {"error": "rate_limited"})

        ctype = self.headers.get("Content-Type", "")
        if ctype.split(";")[0].strip().lower() != "application/json":
            return self._json(415, {"error": "unsupported_media_type"})

        raw_len = self.headers.get("Content-Length")
        if raw_len is None:
            return self._json(411, {"error": "length_required"})
        try:
            length = int(raw_len)
        except ValueError:
            length = -1
        if length < 0:
            return self._json(400, {"error": "invalid_length"})
        if length > MAX_BODY:
            return self._json(413, {"error": "payload_too_large"})

        try:
            body = json.loads(self.rfile.read(length))
        except (ValueError, RecursionError):
            return self._json(400, {"error": "invalid_json"})
        if not isinstance(body, dict):
            return self._json(400, {"error": "invalid_body"})

        # Honeypot: bots get the same success response and nothing is stored.
        if body.get("website"):
            return self._json(200, {"ok": True})

        try:
            name = _clean_name(body.get("name"))
            email = _clean_email(body.get("email"))
            source = _clean_source(body.get("source"))
        except _Invalid as e:
            return self._json(400, {"error": f"invalid_{e.field}"})

        idem = hashlib.sha256(email.encode()).hexdigest()
        store = self.server.store  # type: ignore[attr-defined]
        if store.find_by_idempotency_key(FORM_KEY, idem) is not None:
            return self._json(200, {"ok": True})
        try:
            sub = new_submission(
                form_key=FORM_KEY,
                payload={"name": name, "email": email, **({"source": source} if source else {})},
                submitted_at=datetime.now(timezone.utc),
                idempotency_key=idem,
            )
        except InvalidSubmissionError:
            return self._json(400, {"error": "invalid_submission"})
        try:
            store.add(sub)
        except sqlite3.IntegrityError:
            # Lost the race to an identical concurrent request.
            return self._json(200, {"ok": True})
        deliverer = self.server.deliverer  # type: ignore[attr-defined]
        if deliverer is not None:
            threading.Thread(target=deliver_pending, args=(store, deliverer), daemon=True).start()
        return self._json(201, {"ok": True})

    def _json(self, status: int, obj: object) -> None:
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        addr: tuple[str, int],
        config: Config,
        store: SQLiteSubmissionStore,
        limiter: RateLimiter | None = None,
        deliverer: Deliverer | None = None,
    ) -> None:
        super().__init__(addr, Handler)
        self.config = config
        self.store = store
        self.limiter = limiter or RateLimiter()
        self.deliverer = deliverer


def main() -> None:
    cfg = load_config(os.environ)
    store = SQLiteSubmissionStore(cfg.db_path)
    base_url = os.environ.get("TWENTY_BASE_URL", "").strip()
    api_key = os.environ.get("TWENTY_API_KEY", "").strip()
    deliverer: Deliverer | None = None
    if base_url and api_key:
        client = TwentyClient(base_url=base_url, api_key=api_key)
        deliverer = lambda name, email: deliver(client, name, email)  # noqa: E731
        print("twenty CRM delivery enabled", flush=True)
    else:
        print("TWENTY_BASE_URL or TWENTY_API_KEY not set — delivery skipped", flush=True)
    if deliverer is not None:
        threading.Thread(target=delivery_loop, args=(store, deliverer), daemon=True).start()
    srv = Server((cfg.host, cfg.port), cfg, store, deliverer=deliverer)
    print(f"waitlist listening on {cfg.host}:{cfg.port}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
