# DNS, TLS and tunnel

Verified 2026-11-01. The `lawyerlab.ca` DNS records, SSL mode and tunnel ingress come from the Cloudflare API (`CF_ZONE_TOKEN` for DNS, `CLOUDFLARE_KEY` for SSL and tunnel). The `signallawyers.ca` rows come from public `dig` only.

## DNS records (zone lawyerlab.ca)

| Record | Type | Target | Proxied |
|---|---|---|---|
| `lawyerlab.ca` | CNAME | `96c9987c-….cfargotunnel.com` (tunnel `server`) | yes |
| `www.lawyerlab.ca` | CNAME | `lawyerlab.ca` | yes |
| `staging.lawyerlab.ca` | CNAME | `96c9987c-….cfargotunnel.com` (tunnel `server`) | yes |
| `hrapp.lawyerlab.ca` | CNAME | `96c9987c-….cfargotunnel.com` (tunnel `server`) | yes |

`signal.lawyerlab.ca` and `hr.lawyerlab.ca` have **no DNS records** in this zone. Those surfaces are served on LAN ports only (`:7210`, `:7220`).

## Tunnel ingress (`server` tunnel)

| Hostname | Backend |
|---|---|
| `staging.lawyerlab.ca` | `http://localhost:7200` |
| `www.lawyerlab.ca` | `http://localhost:7200` |
| `lawyerlab.ca` | `http://localhost:7200` |
| `hrapp.lawyerlab.ca` | `http://localhost:7220` |
| (catch-all) | HTTP 404 |

## TLS

Zone SSL mode is **`full`** (not `full (strict)`). `full` accepts any certificate at the origin, including self-signed. Origin traffic arrives through `cloudflared` to `http://localhost:…`, so no origin certificate is presented. Whether the zone SSL mode affects tunnelled traffic at all is **unverified**; check Cloudflare's docs before treating strict as meaningful here. **Decision (owner, 2026-11-01, issue #9):** `full` is accepted for the pilot. Revisit if an origin is ever exposed without the tunnel.

## External hostnames

| Hostname | DNS | Notes |
|---|---|---|
| `signallawyers.ca` | `216.198.79.65` (Vercel) | apex A record |
| `www.signallawyers.ca` | CNAME `*.vercel-dns-017.com` | Vercel |

## Tunnel

`cloudflared` (tunnel ID `96c9987c-c061-4ebd-87dd-b3c6df455f83`, name `server`) runs as a Docker container (`cloudflare/cloudflared`, `restart: unless-stopped`), authenticated with `/etc/cloudflared/cert.pem`. It is **not** part of `deploy/unified/compose.yml`.

## Host boot

`docker.service` enabled via `sudo systemctl enable docker` (assumed done 2026-11-01 per operator). Reboot test not independently observed.

## Uptime monitor

Uptime Kuma 2.5.9 on `192.168.18.22:3011` (`~/stacks/uptime`). Checks `https://lawyerlab.ca/v1/health` every 60s; alerts to Mattermost `#operations`. Same LAN as the host — a home power or internet outage sends no alert. No outside check configured.

## Cloudflare token map

| Name | DNS read | SSL read | Tunnels | Health checks |
|---|---|---|---|---|
| `CF_ZONE_TOKEN` | ✓ (4 records) | ✗ (9109) | ✗ | ✗ |
| `CLOUDFLARE_KEY` | ✗ (10000) | ✓ | ✓ (5 tunnels) | ✗ |
| `CF_ACCOUNT_TOKEN` | ✗ | ✗ | ✗ | ✗ |
| `cloudflare.ini` | ✓ | ✗ | ✗ | ✗ |

No token has health check access (error 10000/10429). Cloudflare Health Checks are not on the Free plan — use an external monitor instead.
