# Unified LawyerLab deployment

This directory owns the unified LawyerLab deployment. The first cutover ran successfully on 2026-10-31. Both configurations use Compose project `app-lawyerlab`, preserving its existing project-scoped networks and named volumes. Never run both deployment procedures concurrently.

The launcher defaults to `~/sites/app-lawyerlab/.env` (relative to this directory) through `COMPOSE_ENV_FILES`; secret files stay in their current locations. Set `COMPOSE_ENV_FILES` to an absolute path to use another operator-managed configuration. Do not copy secret values into tracked files or command output.

Before deploying, ensure the site-lawyerlab `main` worktree is clean, the existing Presidio network and secret files are available, and the operator configuration is current. From this directory, validate with `COMPOSE_ENV_FILES=../../../app-lawyerlab/.env docker compose config --quiet`. Run `./up.sh` to deploy; it validates prerequisites, builds the Tool Parse web bundle, and recreates the existing project. Verify `COMPOSE_ENV_FILES=../../../app-lawyerlab/.env docker compose ps`, HTTP reachability and an authenticated or sample upload. A successful HTTP response alone does not prove processing.

Rollback: from `~/sites/app-lawyerlab`, run its existing `./up.sh` and perform the same verification. Do not use `docker compose down -v` or delete named volumes. Both launchers rebuild and recreate services, so coordinate the cutover and expect interruption and loss of in-memory sessions.

The existing app-lawyerlab README and `docs/POINTERS.md` describe operational prerequisites and the stack. Consult them for background and prerequisites; their launch commands describe the rollback path and their configuration may drift from this directory. The decision is recorded in `docs/adr/0007-deployment-ownership.md`.

## Backups

`deploy/unified/backup.sh` runs nightly at 02:30 (host crontab, log `/tmp/lawyerlab-backup.log`).

- **In scope:** consistent SQLite `.backup` copies of `waitlist.sqlite3` (signups, personal data) and `tool-parse.db` (audit events, metadata).
- **Out of scope, by design:** `blobs` (uploads and outputs are ephemeral), `.env` and other secrets.
- **Where:** `~/backups/lawyerlab` here, then `rsync --delete` to `192.168.18.22:~/backups/lawyerlab/`. Dirs 700, files 600.
- **Retention:** 14 days on both ends. A signup deleted from the live DB leaves backups within 14 days.
- **Restore:** stop the service, copy the chosen `*.db` over the file in its volume, start the service. A restore drill has not been run.
- **Gaps:** `.env` is not backed up, so keep a copy in the operator secret store. Both copies sit on the same LAN as the host.
