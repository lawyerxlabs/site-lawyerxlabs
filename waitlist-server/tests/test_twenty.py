import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
_LF = HERE.parents[2] / "layer-forms" / "src"
if _LF.is_dir():
    sys.path.insert(0, str(_LF))

from layer_forms import SubmissionStatus  # noqa: E402
from twenty import TwentyClient, deliver, parse_name  # noqa: E402

from test_waitlist import GOOD, make_server, post, rows  # noqa: E402,F401


class FakeTwenty:
    """Local HTTP server standing in for Twenty's /rest/people."""

    def __init__(self):
        self.requests = []  # (method, path, query, auth, body)
        self.user_agents = []
        self.existing = {}  # email -> id
        self.fail_status = None
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _reply(self, status, obj):
                data = json.dumps(obj).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _body(self):
                n = int(self.headers.get("Content-Length") or 0)
                return json.loads(self.rfile.read(n)) if n else None

            def do_GET(self):
                outer.user_agents.append(self.headers.get("User-Agent"))
                u = urlparse(self.path)
                q = parse_qs(u.query)
                outer.requests.append(("GET", u.path, q, self.headers.get("Authorization"), None))
                if outer.fail_status:
                    return self._reply(outer.fail_status, {})
                flt = q["filter"][0]
                email = flt.split('"')[1]
                people = [{"id": outer.existing[email]}] if email in outer.existing else []
                self._reply(200, {"data": {"people": people}})

            def do_POST(self):
                outer.user_agents.append(self.headers.get("User-Agent"))
                body = self._body()
                outer.requests.append(("POST", self.path, None, self.headers.get("Authorization"), body))
                if outer.fail_status:
                    return self._reply(outer.fail_status, {})
                self._reply(201, {"data": {"createPerson": {"id": "p-new"}}})

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}/"

    def close(self):
        self.srv.shutdown()
        self.srv.server_close()


@pytest.fixture
def fake():
    f = FakeTwenty()
    yield f
    f.close()


def test_parse_name():
    assert parse_name("Ada Lovelace") == ("Ada", "Lovelace")
    assert parse_name("Mary Jane Watson") == ("Mary Jane", "Watson")
    assert parse_name("Cher") == ("Cher", "")


def test_creates_person_when_absent(fake):
    client = TwentyClient(fake.url, "secret-key")
    assert deliver(client, "Ada Lovelace", "Ada@Example.com") == (True, None)
    get, post_ = fake.requests
    assert get[1] == "/rest/people"  # trailing slash on base_url stripped
    assert get[2]["filter"] == ['emails.primaryEmail[eq]:"ada@example.com"']
    assert get[2]["limit"] == ["1"]
    assert get[3] == "Bearer secret-key"
    assert post_[4] == {
        "name": {"firstName": "Ada", "lastName": "Lovelace"},
        "emails": {"primaryEmail": "ada@example.com"},
    }


def test_sends_explicit_user_agent(fake):
    # Cloudflare in front of Twenty blocks urllib's default UA (error 1010).
    deliver(TwentyClient(fake.url, "k"), "Ada Lovelace", "ada@example.com")
    assert fake.user_agents and all(ua == "lawyerlab-waitlist/1.0" for ua in fake.user_agents)


def test_existing_person_not_duplicated(fake):
    fake.existing["ada@example.com"] = "p-1"
    assert deliver(TwentyClient(fake.url, "k"), "Ada Lovelace", "ada@example.com") == (True, None)
    assert [r[0] for r in fake.requests] == ["GET"]  # no POST, no PATCH


def test_http_error_category_has_no_payload(fake):
    fake.fail_status = 401
    ok, err = deliver(TwentyClient(fake.url, "bad"), "Ada Lovelace", "ada@example.com")
    assert (ok, err) == (False, "twenty_http_401")


def test_network_error_category():
    ok, err = deliver(TwentyClient("http://127.0.0.1:9", "k"), "Ada", "ada@example.com")
    assert (ok, err) == (False, "network_error")


def test_invalid_email_rejected_before_any_request(fake):
    assert deliver(TwentyClient(fake.url, "k"), "Ada", "not-an-email") == (False, "invalid_input")
    assert fake.requests == []


def _wait(cond, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.02)
    return False


def _status(srv):
    sub = srv.store.find_by_idempotency_key(
        "waitlist", __import__("hashlib").sha256(b"ada@example.com").hexdigest()
    )
    return sub


def test_signup_delivers_and_marks_delivered(make_server, fake):
    srv = make_server()
    client = TwentyClient(fake.url, "k")
    srv.deliverer = lambda n, e: deliver(client, n, e)
    assert post(srv, GOOD)[0] == 201
    assert _wait(lambda: _status(srv).status is SubmissionStatus.DELIVERED)
    assert _status(srv).delivery_attempts == 1


def test_twenty_failure_marks_failed_but_signup_still_201(make_server, fake):
    fake.fail_status = 500
    srv = make_server()
    client = TwentyClient(fake.url, "k")
    srv.deliverer = lambda n, e: deliver(client, n, e)
    assert post(srv, GOOD)[0] == 201
    assert _wait(lambda: _status(srv).status is SubmissionStatus.FAILED)
    assert _status(srv).delivery_error == "twenty_http_500"


def test_no_deliverer_stays_pending(make_server):
    srv = make_server()
    assert post(srv, GOOD)[0] == 201
    time.sleep(0.2)
    assert _status(srv).status is SubmissionStatus.PENDING


def test_duplicate_signup_does_not_redeliver(make_server, fake):
    srv = make_server()
    client = TwentyClient(fake.url, "k")
    srv.deliverer = lambda n, e: deliver(client, n, e)
    assert post(srv, GOOD)[0] == 201
    assert _wait(lambda: _status(srv).status is SubmissionStatus.DELIVERED)
    n = len(fake.requests)
    assert post(srv, GOOD)[0] == 200
    time.sleep(0.2)
    assert len(fake.requests) == n


def test_recovery_retries_failed_and_pending_submissions(make_server):
    from server import deliver_pending

    srv = make_server()
    assert post(srv, GOOD)[0] == 201
    sub = _status(srv)
    srv.store.save(sub.record_delivery_failure("network_error"))
    delivered = []
    deliver_pending(srv.store, lambda name, email: (delivered.append(email) or True, None))
    assert delivered == ["ada@example.com"]
    assert _status(srv).status is SubmissionStatus.DELIVERED
    assert _status(srv).delivery_attempts == 2
    deliver_pending(srv.store, lambda name, email: (delivered.append(email) or True, None))
    assert delivered == ["ada@example.com"]


def test_concurrent_recovery_claims_are_serialized(make_server):
    from server import deliver_pending

    srv = make_server()
    assert post(srv, GOOD)[0] == 201
    entered = threading.Event()
    release = threading.Event()
    delivered = []

    def slow(name, email):
        delivered.append(email)
        entered.set()
        assert release.wait(3)
        return True, None

    worker = threading.Thread(target=deliver_pending, args=(srv.store, slow))
    worker.start()
    assert entered.wait(3)
    deliver_pending(srv.store, slow)
    release.set()
    worker.join(timeout=3)
    assert not worker.is_alive()
    assert delivered == ["ada@example.com"]
    assert _status(srv).status is SubmissionStatus.DELIVERED
