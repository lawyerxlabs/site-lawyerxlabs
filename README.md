# site-lawyerlab

LawLabs product shell for bounded legal document workflows.

Deployment profiles and build requirements: [docs/DEPLOYMENT-PROFILES.md](docs/DEPLOYMENT-PROFILES.md).

## Status

Initial scaffold. The product will call `tool-parse` over its HTTP API; it will not embed the processing service.

## Turnstile deployment

Docker image builds require `VITE_TURNSTILE_SITEKEY`, the public Cloudflare sitekey for the frontend hostname. Export it when running `docker compose up -d --build`; the value is compiled into browser assets. The server-side Turnstile secret belongs only in Tool Parse's file-backed gateway secret and must never be passed to this frontend build.

## Startup order (shared networks)

`compose.yml` and tool-parse's `compose.dev.yml` both declare `tool_parse_gateway` and `lawyerlab_auth_bridge` as `external`. Neither stack creates them, so run this once per host before starting either stack, in either order:

```bash
scripts/bootstrap-networks.sh   # idempotent; creates both networks if missing
docker compose up -d --force-recreate
```

`lawyerlab_auth_bridge` is created `--internal` (no egress). Do not create these networks by hand with different options.
