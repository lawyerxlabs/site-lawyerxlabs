#!/usr/bin/env bash
# Proves that one public request reaches nginx with its real client address.
# Usage: scripts/check-real-ip.sh [app-lawyerlab dir] [public URL]
set -euo pipefail
cd "${1:-$HOME/sites/app-lawyerlab}"
public_url="${2:-https://lawyerlab.ca/}"
case "$public_url" in *\?*) separator="&" ;; *) separator="?" ;; esac
marker="real-ip-check-$(date +%s)-$$"

printf '== external request: %s\n' "$public_url"
curl --fail --silent --show-error --output /dev/null --user-agent "$marker" "${public_url%/}${separator}${marker}"

printf '\n== nginx config in the running web container\n'
docker compose exec -T web sh -c 'grep -n "X-Real-IP\|X-Forwarded-For\|real_ip" /etc/nginx/conf.d/*.conf /etc/nginx/nginx.conf 2>/dev/null' || echo "(no match)"

printf '\n== matching access log\n'
line=''
for _ in {1..10}; do
  line=$(docker compose logs --no-log-prefix --tail 1000 web 2>/dev/null | grep -F "$marker" | tail -1 || true)
  [ -n "$line" ] && break
  sleep 1
done
[ -n "$line" ] || { echo "ERROR: public request was not found in the web access log"; exit 1; }
printf '%s\n' "$line"

address=${line%% *}
printf '\n== classification\n%s\n' "$address"
python3 - "$address" <<'PY'
import ipaddress
import sys
try:
    address = ipaddress.ip_address(sys.argv[1])
except ValueError:
    raise SystemExit("ERROR: nginx log did not start with an IP address")
if not address.is_global:
    raise SystemExit(f"ERROR: nginx sees non-public address {address}; do not enable anonymous access")
print(f"OK: nginx sees public client address {address}; gateway X-Real-IP can key anonymous rate limiting per visitor.")
PY
