# Pointers — where to find config and secrets

Locations only. Never paste values into this file, commits, or chat output.

Deployment: the canonical stack is `~/sites/site-lawyerlab/deploy/unified` (`./up.sh`). See [the unified deployment guide](../deploy/unified/README.md). This file lists where secrets live, not how to deploy.

## Turnstile

| Variable | Used by | Where to get it |
|---|---|---|
| `VITE_TURNSTILE_SITEKEY` | Frontend build arg (`compose.yml`) | Cloudflare Turnstile widget for `lawyerlab.ca` (public key). Lookup: `GET /accounts/{CF_ACCOUNT_ID}/challenges/widgets`, match the widget whose `domains` include `lawyerlab.ca`. Token: `CLOUDFLARE_KEY` in `~/.env` (line 12). |
| `TURNSTILE_SECRET_SOURCE_FILE` | Host path to the Turnstile secret (tool-parse `deploy/compose.turnstile.yml`, `deploy/up.sh`) | Operator-provisioned file, default `/etc/tool-parse/secrets/turnstile_secret`; README example uses `$HOME/.config/tool-parse/secrets/turnstile_secret`. Mode 0600, outside the repo. Provision via approved secret manager; never in YAML, `.env`, or chat. |
| (container) `/run/secrets/turnstile_secret` | Gateway env `TURNSTILE_SECRET_FILE` | Compose-mounted read-only copy of the source file. Not a host path. |
| `TURNSTILE_ALLOWED_HOSTNAMES` | Gateway (required, `compose.turnstile.yml`) | Comma-separated hostnames, no scheme/path. Must match the widget's `domains` (production `lawyerlab.ca`; README example shows `staging.lawyerlab.ca`). Pass at launch. |
| `TURNSTILE_ACTION` | Gateway (default `tool_parse_upload`) | Must equal the action the frontend sends (`src/components/FileIntake.tsx` hardcodes `tool_parse_upload`). |

Reference: `../tool-parse/deploy/README.md` lines 51–75 ("Turnstile gateway secret").

Trap: `src/components/FileIntake.tsx` falls back to the Cloudflare test sitekey `1x00000000000000000000AA` only in development builds. A production build without `VITE_TURNSTILE_SITEKEY` leaves uploads blocked and shows "Human verification is not configured. Contact support — uploads are disabled." Always pass the production key at build time. Also avoid `../tool-parse/web/app/.env.development` (test key).

## Gateway secrets

| Variable | Used by | Where to get it |
|---|---|---|
| `PROXY_SECRET` | Gateway (`web-gateway.js` fails if unset); this repo's `compose.yml` passes it through | Operator secret store, consumed by `~/sites/app-lawyerlab/.env`. Never print or commit its value. |
| `PRESIDIO_NETWORK` | `deploy/unified/up.sh` | Operator-owned internal Docker network name. Not created by `up.sh`. |

## Cloudflare credentials

| Name | Location | Notes |
|---|---|---|
| `CLOUDFLARE_KEY` | `~/.env` line 12 | Account-scope token; verified against `/accounts` and Turnstile widgets. |
| `CF_ACCOUNT_ID` | `~/.env` | Account ID for API paths. |
| `CF_ZONE_TOKEN` | `~/.env` line 60 | Verified on `/user/tokens/verify` (200); got 403 on account widgets. |
| `CF_ACCOUNT_TOKEN` | `~/.env` line 59 | Returned 401 on `/user/tokens/verify` and `cfd_tunnel` list. |

`~/.env` is a shell-sourceable file and contains raw secrets. Read single keys without echoing values or whole lines.

## Deploy

| Item | Location |
|---|---|
| Compose | `deploy/unified/compose.yml` (web build arg `VITE_TURNSTILE_SITEKEY` is required; `PROXY_SECRET` in env) |
| Canonical launch | `~/sites/site-lawyerlab/deploy/unified/up.sh` (see `deploy/unified/README.md`). Diagnostic-only standalone compose in this repo is not the production path. |
| Checks run 2026-10-20 | `site-lawyerlab-web-1` Up; `http://127.0.0.1:7200/mvp/` 200; bundle contains production sitekey; `https://lawyerlab.ca/mvp/` 200. (`/v1/health` returned 200 but is not a documented endpoint; do not rely on it.) |
| Smoke test | Authenticated/sample upload through the browser (Turnstile must pass). HTTP 200 alone is not proof. |

## Contract and conventions

- `docs/API-CONTRACT.md` — frozen MVP contract (`mvp-2026-10-19`).
- `AGENTS.md` — build/test/deploy rules and pitfalls.
- Gateway behavior: tool-parse `deploy/web-gateway.js`, `deploy/compose.turnstile.yml`.
