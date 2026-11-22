# Deployment profiles

This repository builds one frontend image per profile. `VITE_SURFACE` selects presentation and the workflow catalogue shown by that build. It is not an authorization boundary.

## Supported profiles

| Profile | `VITE_SURFACE` | Default route | Frontend workflows |
|---|---|---|---|
| LawyerLab | `lawyerlab` (default) | `/mvp/` | `docalias`; `agreement-review` when the backend advertises it; `case-analysis` is disabled. |
| Signal Lawyers | `signal-lawyers` | `/playground/?workflow=term-isolation` (sign-in required to submit) | `docalias`, `term-isolation`, `transaction-review`, `contract-review`, and `agreement-review` when advertised. `case-analysis` is disabled. `term-isolation` is presentation-only and is not in the backend catalog. |

### Local env files (gitignored)

| File | Role |
|---|---|
| `site-lawyerlab/.env` | Source for Compose. Holds the required `AUTH_*` values (see below), `VITE_TURNSTILE_SITEKEY`, and `SIGNAL_TURNSTILE_SITEKEY`. |
| `site-lawyerlab/auth-server/.env` | Local dev copy for running the sidecar outside Compose. Needs the same required `AUTH_*` values, including `AUTH_ORIGINS`; `config.js` throws at startup if `AUTH_ORIGINS` is missing. |

Both are gitignored. Never commit their contents.

### Required frontend build fields

| Field | Meaning | Handling |
|---|---|---|
| `VITE_SURFACE` | Profile identifier | Docker build arg; defaults to `lawyerlab` |
| `VITE_TURNSTILE_SITEKEY` | Public Cloudflare Turnstile site key for deployed frontend hostname | Required Docker build arg; compiled into browser assets |
| `SIGNAL_TURNSTILE_SITEKEY` | Public Turnstile site key for the Signal Lawyers hostname (second web service, `signal-web`) | Compose-only input; required by `compose.yml`. Passed as the `VITE_TURNSTILE_SITEKEY` build arg with `VITE_SURFACE=signal-lawyers` and `NGINX_PORT=7210`; compiled into browser assets |

The Turnstile **secret** stays in the tool-parse gateway's operator-managed secret file. Do not pass it to this build. Do not pass `VITE_API_URL` or browser proxy secrets: the frontend uses same-origin `/v1` and the gateway owns the upstream boundary.

## Build examples

Use real operator-provided site keys only for deployment. The values below are placeholders.

```sh
# LawyerLab, default profile
VITE_SURFACE=lawyerlab VITE_TURNSTILE_SITEKEY=<lawyerlab-public-site-key> npm run build

# Signal Lawyers
VITE_SURFACE=signal-lawyers VITE_TURNSTILE_SITEKEY=<signal-lawyers-public-site-key> npm run build
```

Docker builds use the same two fields:

```sh
docker build \
  --build-arg VITE_SURFACE=lawyerlab \
  --build-arg VITE_TURNSTILE_SITEKEY=<lawyerlab-public-site-key> \
  -t site-lawyerlab .

docker build \
  --build-arg VITE_SURFACE=signal-lawyers \
  --build-arg VITE_TURNSTILE_SITEKEY=<signal-lawyers-public-site-key> \
  -t signal-lawyers .
```

Compose forwards `VITE_SURFACE` and requires `VITE_TURNSTILE_SITEKEY`:

```sh
VITE_SURFACE=lawyerlab VITE_TURNSTILE_SITEKEY=<site-key> \
  docker compose up -d --build
```

Compose also requires `SIGNAL_TURNSTILE_SITEKEY` for `signal-web`, and the auth-sidecar fields (`AUTH_ISSUER`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `AUTH_SESSION_SECRET`, and `AUTH_ORIGINS`). `AUTH_REQUIRED_ROLES` is optional (default `lawyerlab-member,lawyerlab-admin`). Compose pins `AUTH_PORT=7300`; both web services proxy `/api/auth/` to it via `nginx.conf`. These are operator configuration, not frontend build fields. Logto is the identity provider; Better Auth is out of scope. Keep client secrets and session secrets outside tracked files.

## Workflow ID contract

Frontend route IDs, backend upload IDs, and tool-parse allowlist entries are related but distinct. The frontend catalogue ID `docalias` (Alias) uploads without a `workflow` field. `transaction-review` maps to the backend capability ID `transaction-session-intake` (its `backendId`, not an upload ID; it has no `uploadId`) and uses the `/tx/v1/sessions` session API. `contract-review` uploads with `workflow=contract-review`. `term-isolation` is presentation-only (`src/components/TermIsolation.tsx`) and never reaches the catalogue or `GET /v1/workflows`. Disabled frontend catalogue IDs do not grant backend access and may not have installed backend manifests. Signal Lawyers serves:

- `docalias`
- `term-isolation` (Signal default; requires sign-in)
- `transaction-review`
- `contract-review`
- `case-analysis` (disabled)
- `agreement-review` (public when explicitly enabled and advertised; direct `/v1/agreement-review` route)

The Signal default route is `/playground/?workflow=term-isolation`, which requires sign-in to submit. Legacy `/mvp/transaction-intake` and `/playground/transaction-intake` paths redirect there. `prepare-doc` remains a legacy-compatible link that resolves to `docalias`.

Frontend filtering is presentation only. It must not be treated as entitlement, authorization, or server-side workflow enforcement; the backend must validate the requested workflow independently.

Deployment note: `GET /v1/workflows` must list the `contract-review` upload ID and the `transaction-session-intake` backend capability ID for those Signal workflows to appear. A missing backend ID makes its workflow fail closed. Disabled or unavailable workflows must fail closed rather than become an access-control mechanism.

## Dependency and ownership matrix

| Component | Role | Owner / boundary |
|---|---|---|
| This frontend | Profile branding, route selection, upload UI, presentation filtering | This repository; same-origin `/v1` only |
| tool-parse | Upload gateway, Turnstile verification, job processing, workflow manifests, result APIs | External service at the deployed gateway; frontend never imports its source |
| Logto / OIDC | User identity and token issuer | Shared Logto deployment; auth-sidecar/operator configuration |
| Auth sidecar | Server-side Logto code exchange and session cookie | `auth-server/` in this repository; secrets stay server-side |
| launch-mcp | Shared auth, gating, identity, and entitlement middleware for MCP services | External repository at `~/sites/launch-mcp`; not imported by this frontend |
| Turnstile | Human-verification widget and gateway verification | Cloudflare widget + tool-parse gateway secret; public key only in frontend build |
| Caddy | TLS and host routing | Deployment/operator layer; not frontend application logic |
| mcp-hr | External MCP service host | External service; future integration boundary |
| mcp-legalx | External LegalX MCP service host | External service; future profile host, not a frontend dependency |
| mcp-signalx | External SignalX MCP service host | External service; future profile host, not a frontend dependency |
| Lemonade | External/future profile host | Future external service; no frontend integration in Phase 2 |

`launch-mcp` is shared by MCP service hosts such as mcp-hr, mcp-legalx, and mcp-signalx. It is not imported by this frontend and does not change browser routing or profile selection.

## Deployment checklist

- [ ] Choose `lawyerlab` or `signal-lawyers`.
- [ ] Use the matching public Turnstile site key for deployed hostname.
- [ ] Provide tool-parse's server-side Turnstile secret and allowed hostnames through operator configuration.
- [ ] Provide Logto auth-sidecar fields through the deployment secret store.
- [ ] Route TLS/hostnames through Caddy to the frontend and gateway.
- [ ] Confirm tool-parse has a manifest for every workflow enabled server-side.
- [ ] Verify `/v1` remains same-origin from browser; do not add browser proxy secrets.
- [ ] Verify transaction links land at `/playground/?workflow=transaction-intake`.
- [ ] Treat frontend filtering as presentation, not authorization or entitlement enforcement.

Never commit real site keys, OAuth client secrets, session secrets, Turnstile secrets, proxy secrets, or user data.
