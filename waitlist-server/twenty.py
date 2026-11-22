"""
Minimal Python port of @lawtrepreneur/twenty for the waitlist server.

Only what waitlist needs: find-or-create a Person by email. No update step
(waitlist has no allow-listed update fields). Returns a layer-forms-shaped
DeliveryResult-like tuple: (ok: bool, error: str | None).

Unverified assumptions carried from the JS adapter (noted in README):
  - filter syntax: emails.primaryEmail[eq]:"<email>"
  - create response envelope: data.createPerson.id or data.id
  - emails field shape on create: {"primaryEmail": "<email>"}
These were probed live (2026-10-25) and the filter returned 200 with the
expected shape; envelope is assumed from the JS source until a live create
is tested.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
TIMEOUT = 10  # seconds


class TwentyApiError(Exception):
    def __init__(self, status: int) -> None:
        self.status = status
        super().__init__(f"Twenty API status {status}")


class TwentyProtocolError(Exception):
    pass


@dataclass(frozen=True)
class TwentyClient:
    base_url: str  # trailing slash stripped
    api_key: str   # Bearer token, never logged

    def _call(self, method: str, path: str, body: object | None = None) -> Any:
        url = self.base_url.rstrip("/") + "/rest" + path
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "lawyerlab-waitlist/1.0",
            },
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            raise TwentyApiError(e.code) from e
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
            raise ConnectionError("twenty network error") from e

    def find_person_id_by_email(self, email: str) -> str | None:
        """Returns Person id or None when not found."""
        safe = email.replace("\\", "\\\\").replace('"', '\\"')
        qs = urllib.parse.urlencode({"filter": f'emails.primaryEmail[eq]:"{safe}"', "limit": "1"})
        data = self._call("GET", f"/people?{qs}")
        people = data.get("data", {}).get("people", [])
        if not people:
            return None
        return _require_id(people[0].get("id"))

    def create_person(self, fields: dict) -> str:
        """Creates a Person. Returns the new id."""
        data = self._call("POST", "/people", fields)
        person_id = (
            data.get("data", {}).get("createPerson", {}).get("id")
            or data.get("data", {}).get("id")
        )
        return _require_id(person_id)


def _require_id(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise TwentyProtocolError("Twenty response did not include a Person id")
    return value


def parse_name(full_name: str) -> tuple[str, str]:
    """'Ada Lovelace' -> ('Ada', 'Lovelace'). Last word = lastName."""
    parts = full_name.strip().split()
    if len(parts) >= 2:
        return " ".join(parts[:-1]), parts[-1]
    return parts[0] if parts else full_name, ""


def deliver(client: TwentyClient, name: str, email: str) -> tuple[bool, str | None]:
    """
    Find-or-create a Person for this email. Waitlist creates only; no updates.
    Returns (True, None) on success, (False, category_str) on failure.
    Category mirrors the JS adapter: twenty_http_<status>, twenty_protocol_error,
    invalid_input, network_error.
    """
    try:
        if not isinstance(email, str) or not EMAIL_RE.match(email.strip().lower()):
            return False, "invalid_input"
        norm = email.strip().lower()
        pid = client.find_person_id_by_email(norm)
        if pid is None:
            first, last = parse_name(name)
            client.create_person({
                "name": {"firstName": first, "lastName": last},
                "emails": {"primaryEmail": norm},
            })
        return True, None
    except TwentyApiError as e:
        return False, f"twenty_http_{e.status}"
    except TwentyProtocolError:
        return False, "twenty_protocol_error"
    except Exception:  # noqa: BLE001
        return False, "network_error"
