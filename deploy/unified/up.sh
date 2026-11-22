#!/bin/sh
# Single launch path for the LawyerLab + Tool Parse stack. Validates env and secret files, then `up -d --build --force-recreate --wait`.
# Usage: ./up.sh   (Presidio network is mandatory; see README)
set -eu
cd "$(dirname "$0")"
# Reuse the existing operator configuration during the transition.
export COMPOSE_ENV_FILES="${COMPOSE_ENV_FILES:-../../../app-lawyerlab/.env}"

# val VAR: shell value, else ./.env value (Compose reads .env itself; we only read it for checks). Never printed.
val() {
  eval "_v=\${$1:-}"
  if [ -z "$_v" ] && [ -f "$COMPOSE_ENV_FILES" ]; then
    _v=$(sed -n "s/^$1=//p" "$COMPOSE_ENV_FILES" | tail -n 1)
  fi
  printf '%s' "$_v"
}
require() {
  [ -n "$(val "$1")" ] || { echo "up.sh: $1 is required (shell env or .env)" >&2; exit 1; }
}
# secret_file VAR DEFAULT: path must be a readable, non-empty file. Contents never printed.
secret_file() {
  _p=$(val "$1"); _p=${_p:-$2}
  [ -r "$_p" ] && [ -s "$_p" ] || { echo "up.sh: secret file for $1 missing, unreadable, or empty: $_p" >&2; exit 1; }
}

[ "$#" = 0 ] || { echo "usage: $0" >&2; exit 2; }

for v in VITE_TURNSTILE_SITEKEY SIGNAL_TURNSTILE_SITEKEY PROXY_SECRET TURNSTILE_ALLOWED_HOSTNAMES \
         AUTH_BRIDGE_SECRET AUTH_ISSUER AUTH_CLIENT_ID AUTH_CLIENT_SECRET \
         AUTH_SESSION_SECRET AUTH_ORIGINS; do
  require "$v"
done

secret_file TURNSTILE_SECRET_SOURCE_FILE /etc/tool-parse/secrets/turnstile_secret
secret_file AUTH_BRIDGE_SECRET_SOURCE_FILE /etc/tool-parse/secrets/auth_bridge_secret
# Onboarding provider: only the selected one needs a key (local needs none).
case "$(val ONBOARD_LLM_PROVIDER)" in
  ''|cloud) secret_file CLOUD_LLM_KEY_SOURCE_FILE /nonexistent ;;
  openrouter) secret_file OPENROUTER_KEY_SOURCE_FILE /nonexistent ;;
  local) ;;
  *) echo "up.sh: ONBOARD_LLM_PROVIDER must be cloud, openrouter or local" >&2; exit 1 ;;
esac

# Hiring provider: same rules, separate key file (/run/secrets/hiring_llm_key).
case "$(val HIRING_LLM_PROVIDER)" in
  ''|cloud|openrouter) secret_file HIRING_LLM_KEY_SOURCE_FILE /nonexistent ;;
  local) ;;
  *) echo "up.sh: HIRING_LLM_PROVIDER must be cloud, openrouter or local" >&2; exit 1 ;;
esac

# Bridge secret must match on both ends: auth gets it from env, gateway from the file.
_bridge_file=$(val AUTH_BRIDGE_SECRET_SOURCE_FILE); _bridge_file=${_bridge_file:-/etc/tool-parse/secrets/auth_bridge_secret}
[ "$(cat "$_bridge_file")" = "$(val AUTH_BRIDGE_SECRET)" ] \
  || { echo "up.sh: AUTH_BRIDGE_SECRET does not match contents of $_bridge_file" >&2; exit 1; }

# Compose-resolved name (shell env, then .env, as Compose itself reads them). Config JSON holds secrets: never print it.
command -v jq >/dev/null 2>&1 || { echo "up.sh: jq is required for the PRESIDIO_NETWORK preflight" >&2; exit 1; }
_cfg=$(docker compose config --format json) || { echo "up.sh: docker compose config failed (PRESIDIO_NETWORK is required in shell env or .env)" >&2; exit 1; }
_pn=$(printf '%s' "$_cfg" | jq -r '.networks.presidio.name // empty')
[ -n "$_pn" ] || { echo "up.sh: could not resolve Presidio network name from compose config" >&2; exit 1; }
_internal=$(docker network inspect "$_pn" --format '{{.Internal}}' 2>/dev/null) || _internal=missing
[ "$_internal" = true ] \
  || { echo "up.sh: PRESIDIO_NETWORK '$_pn' must be an existing internal network (docker network create --internal); found: $_internal" >&2; exit 1; }

# Fail closed: compose builds ../.., which must be the clean canonical main worktree. Only path/branch/commit printed.
SRC=$(cd ../.. 2>/dev/null && pwd) || { echo "up.sh: canonical source ../.. missing" >&2; exit 1; }
[ "$(git -C "$SRC" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] \
  || { echo "up.sh: $SRC is not a git worktree" >&2; exit 1; }
BRANCH=$(git -C "$SRC" branch --show-current)
[ "$BRANCH" = main ] || { echo "up.sh: $SRC must be on branch main (found: ${BRANCH:-detached})" >&2; exit 1; }
[ -z "$(git -C "$SRC" status --porcelain)" ] || { echo "up.sh: $SRC has uncommitted changes; clean before deploy" >&2; exit 1; }
for p in package.json src/pages/Landing.tsx auth-server; do
  [ -e "$SRC/$p" ] || { echo "up.sh: $SRC missing $p" >&2; exit 1; }
done
echo "Source: $SRC"
echo "Branch: $BRANCH"
echo "Commit: $(git -C "$SRC" rev-parse --short HEAD)"

# compose.yml mounts ../../../tool-parse/web/dist (gitignored, Vite outDir); build it so the gateway never serves an empty dir.
(cd ../../../tool-parse/web/app && npm run build) || { echo "up.sh: web build failed in ../../../tool-parse/web/app" >&2; exit 1; }
[ -f ../../../tool-parse/web/dist/index.html ] \
  || { echo "up.sh: ../../../tool-parse/web/dist/index.html missing after build" >&2; exit 1; }

docker compose up -d --build --force-recreate --wait
