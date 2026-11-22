# Logto auth sidecar

> **Historical:** This archived implementation plan is retained for context. See [ADR 0002](../adr/0002-logto-auth-sidecar.md) for the decision and its amendments; this plan is not current operational guidance.

## Goal
Complete the server-side Logto OIDC flow for staging without exposing tokens or secrets to the browser.

## Decisions
- Use a confidential Logto Traditional client because the sidecar performs the code exchange; retain authorization-code PKCE.
- Keep the auth sidecar as a separate Compose service from the static nginx web image.
- Defer a Logto API resource until LawyerLab has a bearer-token-consuming API.
- Cloudflare Access is the staging authorization boundary; shared Logto authenticates but does not authorize product access.

## Files
- `auth-server/src/config.js`: required runtime configuration, including client secret.
- `auth-server/src/server.js`: discovery, PKCE login/callback, JWT validation, encrypted transaction/session cookies, session/logout routes.
- `auth-server/test/scaffold.test.js`: auth route and fail-closed behavior tests.
- `compose.yml`: inject the client secret into the sidecar.
- `docs/adr/0002-logto-auth-sidecar.md`: onboarding decision and boundaries.

## Execution
1. Wire `AUTH_CLIENT_SECRET` through config, Compose, and tests. Stop if any runtime variable is absent or appears in browser source.
2. Implement login/callback as one security slice: state, nonce, verifier; discovery and token exchange; issuer, audience, nonce, expiry, required claims, and JWKS signature checks. Never mint a session before validation.
3. Implement encrypted authenticated HttpOnly session and transaction cookies, session status, and logout. Set no-store on all auth responses and bound cookie expiry/size.
4. Verify unit tests, build, compose config with non-secret placeholders, local health, and external port binding.
5. Stage only after Cloudflare Access covers `/`, `/api/auth/login`, `/api/auth/callback`, `/api/auth/session`, and `/api/auth/logout`, with upload/WAF/rate limits and redaction prerequisite #5 satisfied.

## Stop conditions
- Stop implementation if Logto discovery or JWKS behavior cannot be verified without inventing provider behavior.
- Stop staging release if any auth response leaks tokens, the sidecar is externally reachable, or Cloudflare Access is not invite-only across all auth paths.
