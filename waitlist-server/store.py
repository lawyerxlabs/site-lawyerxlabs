"""SQLite implementation of layer_forms.SubmissionStore.

Connection per call: sqlite3 connections are not shared across threads, and
WAL lets concurrent readers and one writer proceed. Uniqueness on
(form_key, idempotency_key) is enforced by the index; conflicts surface as
sqlite3.IntegrityError from add().
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Mapping
from contextlib import closing
from datetime import datetime
from typing import Any
from uuid import UUID

from layer_forms import Submission, SubmissionStatus

_SCHEMA = """
CREATE TABLE IF NOT EXISTS submissions (
    submission_id    TEXT PRIMARY KEY,
    form_key         TEXT NOT NULL,
    payload          TEXT NOT NULL,
    submitted_at     TEXT NOT NULL,
    idempotency_key  TEXT,
    status           TEXT NOT NULL,
    delivery_attempts INTEGER NOT NULL,
    delivery_error   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS submissions_idempotency
    ON submissions (form_key, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
"""

_COLUMNS = (
    "submission_id, form_key, payload, submitted_at, idempotency_key, "
    "status, delivery_attempts, delivery_error"
)


def _plain(value: Any) -> Any:
    # Frozen payload -> JSON-serialisable. Sets lose their type on reload;
    # the waitlist payload is strings only, so this is never hit in practice.
    if isinstance(value, Mapping):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_plain(v) for v in value]
    return value


def _load(row: tuple) -> Submission:
    sid, form_key, payload, submitted_at, idem, status, attempts, error = row
    # Submission.__post_init__ re-freezes the payload.
    return Submission(
        submission_id=UUID(sid),
        form_key=form_key,
        payload=json.loads(payload),
        submitted_at=datetime.fromisoformat(submitted_at),
        idempotency_key=idem,
        status=SubmissionStatus(status),
        delivery_attempts=attempts,
        delivery_error=error,
    )


class SQLiteSubmissionStore:
    def __init__(self, path: str) -> None:
        self._path = path
        self.lock_path = path + ".delivery.lock"
        with closing(sqlite3.connect(path, timeout=5)) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(_SCHEMA)

    def _run(self, sql: str, params: tuple = (), fetch: bool = False) -> Any:
        with closing(sqlite3.connect(self._path, timeout=5)) as conn, conn:
            cur = conn.execute(sql, params)
            return cur.fetchall() if fetch else cur.rowcount

    def add(self, submission: Submission) -> None:
        self._run(
            f"INSERT INTO submissions ({_COLUMNS}) VALUES (?,?,?,?,?,?,?,?)",
            (
                str(submission.submission_id),
                submission.form_key,
                json.dumps(_plain(submission.payload)),
                submission.submitted_at.isoformat(),
                submission.idempotency_key,
                submission.status.value,
                submission.delivery_attempts,
                submission.delivery_error,
            ),
        )

    def undelivered(self, after: str = "", limit: int = 100) -> list[Submission]:
        rows = self._run(
            f"SELECT {_COLUMNS} FROM submissions WHERE status IN ('pending', 'failed') "
            "AND submission_id > ? ORDER BY submission_id LIMIT ?",
            (after, limit), fetch=True,
        )
        return [_load(row) for row in rows]

    def get(self, submission_id: UUID) -> Submission | None:
        rows = self._run(
            f"SELECT {_COLUMNS} FROM submissions WHERE submission_id = ?",
            (str(submission_id),),
            fetch=True,
        )
        return _load(rows[0]) if rows else None

    def find_by_idempotency_key(
        self, form_key: str, idempotency_key: str
    ) -> Submission | None:
        rows = self._run(
            f"SELECT {_COLUMNS} FROM submissions "
            "WHERE form_key = ? AND idempotency_key = ?",
            (form_key, idempotency_key),
            fetch=True,
        )
        return _load(rows[0]) if rows else None

    def save(self, submission: Submission) -> None:
        n = self._run(
            "UPDATE submissions SET form_key = ?, payload = ?, submitted_at = ?, "
            "idempotency_key = ?, status = ?, delivery_attempts = ?, "
            "delivery_error = ? WHERE submission_id = ?",
            (
                submission.form_key,
                json.dumps(_plain(submission.payload)),
                submission.submitted_at.isoformat(),
                submission.idempotency_key,
                submission.status.value,
                submission.delivery_attempts,
                submission.delivery_error,
                str(submission.submission_id),
            ),
        )
        if n != 1:
            raise KeyError(str(submission.submission_id))
