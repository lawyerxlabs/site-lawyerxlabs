import hashlib
import json
import sqlite3
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))  # server.py, store.py
_LF = HERE.parents[2] / "layer-forms" / "src"
if _LF.is_dir():
    sys.path.insert(0, str(_LF))  # sibling layer_forms when not installed

import http.client  # noqa: E402

from layer_forms import Submission, SubmissionStatus, new_submission  # noqa: E402
from server import Config, RateLimiter, Server  # noqa: E402
from store import SQLiteSubmissionStore  # noqa: E402

ORIGIN = "https://lawyerlab.ca"


@pytest.fixture
def make_server(tmp_path):
    servers = []

    def make(allow_no_origin=True, limiter=None):
        db = tmp_path / f"w{len(servers)}.sqlite3"
        cfg = Config(
            host="127.0.0.1",
            port=0,
            db_path=str(db),
            origins=frozenset({ORIGIN}),
            allow_no_origin=allow_no_origin,
        )
        store = SQLiteSubmissionStore(str(db))
        srv = Server(("127.0.0.1", 0), cfg, store, limiter=limiter)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        servers.append(srv)
        return srv

    yield make
    for s in servers:
        s.shutdown()
        s.server_close()


def post(srv, body=None, *, raw=None, headers=None):
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    data = raw if raw is not None else json.dumps(body or {}).encode()
    conn = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=5)
    conn.request("POST", "/api/waitlist", body=data, headers=h)
    r = conn.getresponse()
    out = r.status, json.loads(r.read() or b"null")
    conn.close()
    return out


def rows(srv):
    with sqlite3.connect(srv.config.db_path) as c:
        return c.execute("select count(*) from submissions").fetchone()[0]


GOOD = {"name": "Ada Lovelace", "email": "Ada@Example.com"}


def test_success_201_and_stored_normalized(make_server):
    srv = make_server()
    assert post(srv, GOOD) == (201, {"ok": True})
    assert rows(srv) == 1
    sub = srv.store.find_by_idempotency_key(
        "waitlist", hashlib.sha256(b"ada@example.com").hexdigest()
    )
    assert sub.payload["email"] == "ada@example.com"
    assert sub.payload["name"] == "Ada Lovelace"
    assert sub.status is SubmissionStatus.PENDING


def test_health(make_server):
    srv = make_server()
    conn = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=5)
    conn.request("GET", "/api/waitlist/health")
    r = conn.getresponse()
    assert r.status == 200
    assert json.loads(r.read()) == {"ok": True}


def test_duplicate_email_200_one_row(make_server):
    srv = make_server()
    assert post(srv, GOOD)[0] == 201
    assert post(srv, {"name": "Other", "email": "ada@example.com "}) == (
        200,
        {"ok": True},
    )
    assert rows(srv) == 1


def test_name_missing_400(make_server):
    srv = make_server()
    assert post(srv, {"email": "a@b.co"}) == (400, {"error": "invalid_name"})
    assert rows(srv) == 0


def test_name_control_char_400(make_server):
    srv = make_server()
    assert post(srv, {"name": "Ada\x00", "email": "a@b.co"}) == (
        400,
        {"error": "invalid_name"},
    )


def test_name_too_long_400(make_server):
    srv = make_server()
    assert post(srv, {"name": "x" * 121, "email": "a@b.co"})[0] == 400


def test_bad_email_400(make_server):
    srv = make_server()
    assert post(srv, {"name": "Ada", "email": "not-an-email"}) == (
        400,
        {"error": "invalid_email"},
    )
    assert rows(srv) == 0


def test_honeypot_200_zero_rows(make_server):
    srv = make_server()
    assert post(srv, {**GOOD, "website": "http://spam"}) == (200, {"ok": True})
    assert rows(srv) == 0


def test_bad_origin_403(make_server):
    srv = make_server()
    assert post(srv, GOOD, headers={"Origin": "https://evil.example"})[0] == 403
    assert rows(srv) == 0


def test_good_origin_allowed(make_server):
    srv = make_server(allow_no_origin=False)
    assert post(srv, GOOD, headers={"Origin": ORIGIN})[0] == 201


def test_missing_origin_without_env_403(make_server):
    srv = make_server(allow_no_origin=False)
    assert post(srv, GOOD)[0] == 403
    assert rows(srv) == 0


def test_oversized_body_413(make_server):
    srv = make_server()
    big = b'{"name":"' + b"a" * 5000 + b'","email":"a@b.co"}'
    assert post(srv, raw=big)[0] == 413
    assert rows(srv) == 0


def test_non_json_415(make_server):
    srv = make_server()
    assert post(srv, raw=b"name=x", headers={"Content-Type": "text/plain"})[0] == 415


def test_rate_limit_429(make_server):
    srv = make_server(limiter=RateLimiter(limit=10, window=60))
    hdr = {"X-Real-IP": "203.0.113.7"}
    for i in range(10):
        assert post(srv, {"name": "A", "email": f"u{i}@x.co"}, headers=hdr)[0] == 201
    assert post(srv, {"name": "A", "email": "late@x.co"}, headers=hdr)[0] == 429
    # Different client IP is unaffected.
    other = {"X-Real-IP": "203.0.113.8"}
    assert post(srv, {"name": "A", "email": "other@x.co"}, headers=other)[0] == 201


def test_rate_limiter_window_slides():
    t = [0.0]
    rl = RateLimiter(limit=2, window=60, clock=lambda: t[0])
    assert rl.allow("ip") and rl.allow("ip")
    assert not rl.allow("ip")
    t[0] = 60.0
    assert rl.allow("ip")


def test_payload_not_echoed_in_errors(make_server):
    srv = make_server()
    secret = "SECRET-PII-123@@"
    status, body = post(srv, {"name": "", "email": secret})
    assert status == 400
    assert secret not in json.dumps(body)
    status, body = post(srv, {"name": "Ada", "email": secret})
    assert secret not in json.dumps(body)


def test_store_round_trip(tmp_path):
    store = SQLiteSubmissionStore(str(tmp_path / "rt.sqlite3"))
    sub = new_submission(
        form_key="waitlist",
        payload={"name": "Ada", "email": "a@b.co", "tags": ["x", 1, None]},
        submitted_at=datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc),
        idempotency_key="k" * 64,
    )
    store.add(sub)
    got = store.get(sub.submission_id)
    assert got == sub
    assert got.status is SubmissionStatus.PENDING
    assert got.payload["tags"] == ("x", 1, None)

    delivered = sub.record_delivery_failure("boom")
    store.save(delivered)
    got = store.get(sub.submission_id)
    assert got.status is SubmissionStatus.FAILED
    assert got.delivery_attempts == 1
    assert got.delivery_error == "boom"
    assert store.get(uuid4()) is None


def test_store_unique_idempotency(tmp_path):
    store = SQLiteSubmissionStore(str(tmp_path / "u.sqlite3"))
    ts = datetime(2026, 1, 1, tzinfo=timezone.utc)
    a = new_submission(form_key="waitlist", payload={"e": "x"}, submitted_at=ts, idempotency_key="k")
    b = new_submission(form_key="waitlist", payload={"e": "y"}, submitted_at=ts, idempotency_key="k")
    store.add(a)
    with pytest.raises(sqlite3.IntegrityError):
        store.add(b)
    # Null keys never collide.
    store.add(new_submission(form_key="waitlist", payload={"e": "1"}, submitted_at=ts))
    store.add(new_submission(form_key="waitlist", payload={"e": "2"}, submitted_at=ts))


def _payload(srv, email):
    sub = srv.store.find_by_idempotency_key("waitlist", hashlib.sha256(email.encode()).hexdigest())
    return sub.payload


def test_source_stored(make_server):
    srv = make_server()
    assert post(srv, {**GOOD, "source": "signal-lawyers"})[0] == 201
    assert _payload(srv, "ada@example.com")["source"] == "signal-lawyers"


def test_source_optional(make_server):
    srv = make_server()
    assert post(srv, GOOD)[0] == 201
    assert "source" not in _payload(srv, "ada@example.com")


@pytest.mark.parametrize("bad", ["Has Space", "UPPER", "x" * 65, 5, "a/b"])
def test_source_invalid_400(make_server, bad):
    srv = make_server()
    assert post(srv, {**GOOD, "source": bad}) == (400, {"error": "invalid_source"})
    assert rows(srv) == 0


def test_duplicate_across_sources_one_row(make_server):
    srv = make_server()
    assert post(srv, {**GOOD, "source": "lawyerlab"})[0] == 201
    assert post(srv, {**GOOD, "source": "human-resources"})[0] == 200
    assert rows(srv) == 1
    assert _payload(srv, "ada@example.com")["source"] == "lawyerlab"
