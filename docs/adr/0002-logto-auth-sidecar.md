# ADR 0002: Logto authentication sidecar

**Status:** Accepted (2026-10-22; amended same day for gateway identity)
**Date:** 2026-10-22
**Scope:** LawyerLab product shell (`lawyerlab.ca`, `staging.lawyerlab.ca`); GitHub issue #13

## Context

LawyerLab needs a browser login flow using the shared Logto identity provider. The existing product shell serves static assets through nginx and sends workflow requests to the tool-parse gateway under `/v1/`. These are separate boundaries: a valid identity does not, by itself, grant entitlement to a LawyerLab workflow or prove identity to the gateway.

The auth implementation lives in `auth-server/`. Compose defines it as a separate Node service named `auth` on the default compose network, port 7300, bound to the container interface (`AUTH_HOST=0.0.0.0`) with no host port publish. `web` also runs on the default network and publishes only `127.0.0.1:7200`; nginx forwards `/api/auth/` to `http://auth:7300`. Auth also joins the internal-only `lawyerlab_auth_bridge` network (explicit name, no egress), which the Tool Parse gateway uses for `GET /internal/auth/identity`; that route requires the `x-lawyerlab-bridge-secret` header matching `AUTH_BRIDGE_SECRET` (required config) and returns 403 on a wrong or missing secret, 401 on an invalid, missing, or expired session. The `/v1/` location separately forwards to `tool-parse-gateway:8080` on the external `tool_parse_gateway` network. Both upstreams are runtime-resolved, and the networks must be bootstrapped first (Decision 8). The auth proxy adds `Cache-Control: no-store`; auth responses also set this header.

The sidecar performs the OIDC authorization-code exchange. It uses PKCE with S256 and generates state and nonce values. It checks the callback transaction and validates the ID token signature, issuer, audience, nonce, expiry, and subject before creating a session. Configuration fails closed when required environment variables are absent. Required names include `AUTH_ISSUER`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `AUTH_ORIGINS`, and `AUTH_SESSION_SECRET`; `AUTH_REQUIRED_ROLES` is optional.

The earlier plan records the reasons to keep the auth service separate, defer a Logto API resource until a bearer-token-consuming API exists, and use Cloudflare Access as the staging authorization boundary. The deployment profile documentation classifies auth values as operator configuration, not frontend build fields, and says local env files are gitignored.

Issue #13's body calls for a “browser public client.” That wording conflicts with the implemented server-side exchange, which uses a client secret. The decision below makes the client type explicit and requires correcting the issue text.

## Decision

1. **Use a confidential Logto Traditional web client with authorization code and PKCE (S256).** The sidecar exchanges the code and keeps `AUTH_CLIENT_SECRET` server-side. This intentionally diverges from issue #13's “browser public client” wording. Correct the issue body to specify a confidential client and server-side exchange; retain PKCE.

2. **Keep auth in a separate Node sidecar, Docker-internal only.** Compose service `auth` listens on container port 7300 with no host publish. It is not inside the static nginx image. nginx proxies `/api/auth/` to `http://auth:7300` on the default network. Only `web` publishes a host port (`127.0.0.1:7200`). The tool-parse gateway is a separate service: nginx proxies `/v1/` to `tool-parse-gateway:8080`, the network alias defined by tool-parse's `compose.dev.yml` on the external `tool_parse_gateway` network. The gateway reaches `auth:7300` only over the internal `lawyerlab_auth_bridge` network with `AUTH_BRIDGE_SECRET`. `web` resolves these upstreams at request time through Docker DNS (`resolver 127.0.0.11`), so recreating `auth` or the gateway does not require recreating `web`.

3. **Separate authentication from authorization.** Logto authenticates the user. LawyerLab enforces a local role gate using `lawyerlab-member` or `lawyerlab-admin` by default; `AUTH_REQUIRED_ROLES` can override the required set. A successful login alone is not product entitlement. For staging, Cloudflare Access covers the auth paths as specified in the prior plan. Shared Logto is not the product authorization boundary.

4. **Defer a Logto API resource and RFC 8707 resource indicator.** No current bearer-token-consuming API requires an audience-bound access token. Reopen this decision if such an API is introduced.

5. **Use a sealed cookie session.** The sidecar seals session data with AES-256-GCM. The session cookie is `HttpOnly; Secure; SameSite=Lax` and lasts 3600 seconds. The transaction cookie uses the same flags and lasts 600 seconds. Do not mint a session until token validation and the local role gate both succeed. Auth responses are `Cache-Control: no-store`.

6. **Derive the redirect origin from Host and allowlist it.** Build the origin from the request Host header, then require an exact match in `AUTH_ORIGINS`, whose entries are bare HTTPS origins. Do not derive it from client-settable forwarding headers. Compose/nginx forwards Host as `$host`.

7. **Keep staging authorization bounded by Cloudflare Access.** Apply Cloudflare Access to the staging auth paths, including login and callback, as the plan directs. A shared Logto tenant authenticates; it does not define the staging product-access policy.

8. **Bootstrap the shared networks before either stack.** Both `tool_parse_gateway` and `lawyerlab_auth_bridge` are declared `external` in this repo's `compose.yml` and in tool-parse's overlay. Neither compose file creates the networks, so `docker compose up` fails until they exist. Run `scripts/bootstrap-networks.sh` once per host (idempotent) before starting LawyerLab or Tool Parse, in either order. `lawyerlab_auth_bridge` is created `--internal`.

## Consequences

- The browser never receives the client secret. It receives redirects and an encrypted, HttpOnly session cookie; session status returns only the fields exposed by the sidecar.
- The auth sidecar has its own runtime configuration and failure boundary. Missing required `AUTH_*` values prevent startup rather than allowing partial configuration.
- Redirect URI origins are deployment-configured through `AUTH_ORIGINS`; an unlisted Host is rejected. Host routing and the allowlist must agree for every deployed LawyerLab origin.
- The current role check depends on the ID token's `roles` claim. Logto Management API confirms that `lawyerlab-member` and `lawyerlab-admin` roles exist, but this repo-only check does not prove that the configured OIDC client emits the `roles` claim in ID tokens. If roles are misconfigured, local authorization can diverge from intended access.
- The session cookie authenticates the browser to the auth sidecar. It does not currently convey verified identity to `/v1/`; gateway entitlement and identity propagation remain separate questions.
- Cloudflare Access is a staging control, not a replacement for application authorization or a declaration of production access policy.
- GET logout clears the cookies, but permits cross-site logout initiation. Revisit method and CSRF behavior.
- No API resource means this decision does not establish an access-token audience for a future API.

## Alternatives considered

### Browser public client

Rejected. The sidecar performs the code exchange and possesses the client secret, so a browser public-client model does not match the implementation or secret boundary. Correct issue #13 rather than preserving contradictory wording. PKCE remains required.

### Put auth routes in the nginx web image

Rejected. nginx serves a static frontend; embedding Node auth behavior there would couple the auth runtime to the web image. A separate service gives the auth code its own runtime and exposes it only through the `/api/auth/` proxy path.

### Treat Logto login as product entitlement

Rejected. Authentication establishes identity, not authorization to use LawyerLab. The sidecar applies an explicit local role gate; staging also relies on Cloudflare Access. The Logto tenant is shared and is not the LawyerLab product boundary.

### Create a Logto API resource now

Deferred. No current API consumes a bearer token from this flow. Adding an audience/resource indicator now would have no consumer-side enforcement to complete the boundary. Reopen when a bearer-token API exists.

### Trust forwarded scheme/host headers for redirect origin

Rejected. Client-settable forwarding headers are not a safe source for redirect destinations. Use Host-derived origin plus the exact `AUTH_ORIGINS` allowlist.

## Amendment (2026-10-22): gateway identity

**Status:** Accepted. Amends Decision 3 ("separate authentication from authorization") and the "session cookie does not convey identity to `/v1/`" consequence for the signed-in quota MVP only.

Decision 3 was originally drafted to keep verified identity away from tool-parse for the pilot. That stance is superseded for signed-in users:

- For signed-in users only, the tool-parse gateway forwards verified identity: `org = lawyerlab` (fixed), `user = OIDC sub`.
- The gateway obtains identity by calling LawyerLab `/internal/auth/identity` over a dedicated bridge network. That endpoint is authenticated by a bridge secret separate from the tool-parse `PROXY_SECRET`.
- Anonymous and invalid sessions remain identity-blind and use the existing anonymous path.
- Bridge outage returns `503`. The gateway never falls back to anonymous for a signed-in user.
- Auth remains separate from tool-parse authorization. Forwarded identity is for quota and tenancy attribution, not a LawyerLab entitlement check.

The "session cookie does not convey identity to `/v1/`" consequence above and the gateway-identity open question below are resolved by this amendment for signed-in users. Other decisions are unchanged.

## Open questions

- ~~**Gateway identity:**~~ Resolved by the 2026-10-22 amendment above.
- **Logto roles claim:** Does Logto emit the `roles` claim in the ID token for this client and configuration? Repository code expects an array of role strings; Logto-side behavior is not verifiable here.
- **Registration policy:** Logto Management API reports `signInMode: SignIn`, with no sign-up mode enabled. Confirm this remains true during staging acceptance so access remains invite-only.
- **Logout method:** Should logout change from GET to POST to prevent cross-site logout through an embedded image or link?
- **RFC 8707:** Should the resource indicator be reopened when the gateway or another API begins consuming bearer tokens?

## References

- GitHub issue #13, Logto auth integration (issue text calls for a browser public client; correction required).
- `docs/archive/0002-logto-auth-sidecar-plan.md` — implementation plan (2026-10-21); decisions folded into the appendix below.
- `auth-server/src/server.js` — OIDC discovery, PKCE state/nonce, callback validation, token verification, role gate, cookies, routes, and Host-derived origin.
- `auth-server/src/config.js` — required environment variable names, `AUTH_ORIGINS` parsing, default roles, and port default.
- `compose.yml` — separate `auth` service on the internal `lawyerlab_auth_bridge` network, container port 7300, no host publish, and environment wiring.
- `nginx.conf` — `/api/auth/` proxy to `auth:7300` with no-store header; separate `/v1/` proxy to `tool-parse-gateway:8080` on the external `tool_parse_gateway` network.
- `docs/archive/0002-logto-auth-sidecar-plan.md` — implementation plan (2026-10-21); folded into the appendix below.
- `docs/DEPLOYMENT-PROFILES.md` — operator env-file roles and auth configuration handling.

## Appendix: implementation plan (2026-10-21)

> Folded in from `0002-logto-auth-sidecar-plan.md` (now `docs/archive/0002-logto-auth-sidecar-plan.md`). Records the decisions and staging sequence as originally drafted; the ADR body above is the decision of record.

### Goal

Complete the server-side Logto OIDC flow for staging without exposing tokens or secrets to the browser.

### Decisions

- Use a confidential Logto Traditional client because the sidecar performs the code exchange; retain authorization-code PKCE.
- Keep the auth sidecar as a separate Compose service from the static nginx web image.
- Defer a Logto API resource until LawyerLab has a bearer-token-consuming API.
- Cloudflare Access is the staging authorization boundary; shared Logto authenticates but does not authorize product access.

### Files

- `auth-server/src/config.js`: required runtime configuration, including client secret.
- `auth-server/src/server.js`: discovery, PKCE login/callback, JWT validation, encrypted transaction/session cookies, session/logout routes.
- `auth-server/test/scaffold.test.js`: auth route and fail-closed behavior tests.
- `compose.yml`: inject the client secret into the sidecar.
- `docs/adr/0002-logto-auth-sidecar.md`: onboarding decision and boundaries.

### Execution

1. Wire `AUTH_CLIENT_SECRET` through config, Compose, and tests. Stop if any runtime variable is absent or appears in browser source.
2. Implement login/callback as one security slice: state, nonce, verifier; discovery and token exchange; issuer, audience, nonce, expiry, required claims, and JWKS signature checks. Never mint a session before validation.
3. Implement encrypted authenticated HttpOnly session and transaction cookies, session status, and logout. Set no-store on all auth responses and bound cookie expiry/size.
4. Verify unit tests, build, compose config with non-secret placeholders, local health, and external port binding.
5. Stage only after Cloudflare Access covers `/`, `/api/auth/login`, `/api/auth/callback`, `/api/auth/session`, and `/api/auth/logout`, with upload/WAF/rate limits and redaction prerequisite #5 satisfied.

### Stop conditions

- Stop implementation if Logto discovery or JWKS behavior cannot be verified without inventing provider behavior.
- Stop staging release if any auth response leaks tokens, the sidecar is externally reachable, or Cloudflare Access is not invite-only across all auth paths.
