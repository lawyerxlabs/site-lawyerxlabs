#!/usr/bin/env bash
# Nightly consistent copies of waitlist.sqlite3 and tool-parse.db (audit events). Not blobs, not .env.
# Output holds waitlist personal data: dir 700, files 600, pruned after KEEP_DAYS.
set -euo pipefail
OUT="${BACKUP_DIR:-$HOME/backups/lawyerlab}"
REMOTE="${BACKUP_REMOTE:-192.168.18.22:backups/lawyerlab/}"
KEEP_DAYS=14
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
umask 077
mkdir -p "$OUT"
for pair in "waitlist-data:waitlist.sqlite3" "tool-parse-data:tool-parse.db"; do
  vol="app-lawyerlab_${pair%%:*}"; db="${pair##*:}"
  docker run --rm --user root -v "$vol:/d" -v "$OUT:/o" keinos/sqlite3 sh -c \
    "sqlite3 /d/$db \".backup /o/${db%.*}-$STAMP.db\" && chown $(id -u):$(id -g) /o/${db%.*}-$STAMP.db"
done
chmod 600 "$OUT"/*.db
find "$OUT" -maxdepth 1 -name '*.db' -mtime +"$KEEP_DAYS" -delete
# --delete mirrors the local 14-day pruning so personal data does not outlive it off-box
rsync -a --delete -e "ssh -o BatchMode=yes -o ConnectTimeout=10" "$OUT/" "$REMOTE"
echo "backup ok $STAMP"
