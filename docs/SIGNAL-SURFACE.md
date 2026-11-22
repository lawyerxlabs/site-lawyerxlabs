# Signal Lawyers surface

The Signal Lawyers surface is a second build of this repo, not a fork.

```sh
VITE_SURFACE=signal-lawyers VITE_TURNSTILE_SITEKEY=<site-key> npm run build
# Docker:
docker build --build-arg VITE_SURFACE=signal-lawyers --build-arg VITE_TURNSTILE_SITEKEY=<site-key> -t signal-lawyers .
```

It opens at `/playground/?workflow=term-isolation`, which requires sign-in to submit. Its configured workflows are `term-isolation` (default, sign-in), `docalias` (Alias, no sign-in), `transaction-review`, `contract-review` (both sign-in), `agreement-review` (public when the backend advertises it), and disabled `case-analysis`. Brand and audience copy come from `src/surfaces/signal-lawyers.ts` (resolved through `src/surface.ts`). Contract review is available only when the backend catalog exposes it; it accepts signed-in PDF/DOCX uploads and returns protected no-restore output. Static head metadata (title, description, OpenGraph, Twitter) is rewritten for this build by `applySurfaceMeta` in `vite.config.ts`. LawyerLab remains the default build when `VITE_SURFACE` is omitted.

Smoke test after deploy: open `/playground/?workflow=term-isolation` signed out and confirm the sign-in prompt, then open `/playground/?workflow=docalias` and confirm an Alias upload completes. Sign in and confirm `transaction-review` and `contract-review` submit. HTTP 200 alone is not proof.

Deployment needs its own host, Turnstile site key, and server-side workflow allowlist. See [Deployment profiles](DEPLOYMENT-PROFILES.md) for operator fields and ownership. Frontend filtering is presentation only; do not expose a paid surface publicly until server-side identity and entitlement enforcement is complete.
