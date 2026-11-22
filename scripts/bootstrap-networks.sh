#!/usr/bin/env bash
# Create the two external Docker networks shared by LawyerLab and Tool Parse. Idempotent.
# Run once per host before `docker compose up` in either stack (see README.md).
set -euo pipefail

# ensure_network NAME [docker-network-create flags...]
# Creates NAME if missing; fails if an existing network's internal flag differs from the request.
ensure_network() {
  local name="$1"; shift
  local want_internal=false
  for arg in "$@"; do [[ "$arg" == "--internal" ]] && want_internal=true; done

  if docker network inspect "$name" >/dev/null 2>&1; then
    local have_internal
    have_internal="$(docker network inspect --format '{{.Internal}}' "$name")"
    if [[ "$have_internal" != "$want_internal" ]]; then
      echo "error: $name exists with internal=$have_internal (expected $want_internal); fix by hand" >&2
      exit 1
    fi
  else
    docker network create "$@" "$name" >/dev/null
  fi
  echo "ok: $name (internal=$want_internal)"
}

ensure_network tool_parse_gateway
ensure_network lawyerlab_auth_bridge --internal
