# site-lawyerlab

LawLabs — customer-facing product shell (`lawyerlab.ca`) for bounded legal document workflows (redaction MVP first). It calls the self-hosted `lawtrepreneur/tool-parse` service over HTTP (`/v1`); it never imports tool-parse source or treats it as a package dependency. Architecture and boundaries live in `docs/API-CONTRACT.md` and `docs/BRANDING.md`; the open issue list is the plan of record.

## Dev environment

- Node + npm (lockfile present; don't hand-edit `package-lock.json`, use `npm install --package-lock-only` after renaming the package).
- `.env` is local and gitignored (`.env*` ignored except `.env.example`). Copy `.env.example` and fill values from operator config; never commit or print values.

## Unified deployment canon

- Canonical deployment is `~/sites/site-lawyerlab/deploy/unified`: `cd ~/sites/site-lawyerlab/deploy/unified && ./up.sh`. The launcher takes no arguments.
- This repo owns unified runtime composition. Its root standalone `docker compose` is for isolated diagnostics.
- Full guide: [deploy/unified/README.md](deploy/unified/README.md).

## Build & test

```bash
npm install          # first setup
npm run dev          # Vite dev server on 127.0.0.1:7200, proxies /v1 → localhost:7100
npm test             # vitest run (35 test files, tests/**; node environment)
npm run build        # tsc --noEmit && vite build → dist/ (inside the repo, gitignored)
```

No linter is configured. Verification = `npm test` + `npm run build`.

Browser checks (#7), both need `xvfb-run -a` and `google-chrome`; set `E2E_BASE_URL=https://lawyerlab.ca` for production, default is local `:7200`:
- `npm run e2e` — axe WCAG 2.1 A/AA scan of public pages.
- `npm run e2e:upload` — real upload, read-once, delete, and cross-identity isolation with the synthetic fixture. A plain node script, not the Playwright runner: Turnstile never verifies inside the runner.

- Auth server tests: `cd auth-server && npm test` (node:test).

## Architecture

- `src/lib/api.ts` — the entire API boundary: typed Job/Report types, the `ApiError` class, and fetch calls. Keep it one small module; it mirrors the frozen contract, don't widen it ad hoc.
- `src/main.tsx` — routes: `/mvp/` (upload app), `/playground/` (all workflows, `?workflow=` param), `/playground/jobs/:jobId`, `/mvp/transaction-intake` + `/playground/transaction-intake` (redirects), legacy `/app/*` redirects (inherited from tool-parse UI).
- `docs/API-CONTRACT.md` is frozen for the MVP (`mvp-2026-10-19`). The authoritative result paths are `/v1/jobs/:id/result/markdown` and `/result/report` (NOT `/markdown`, `/report`). Result endpoints are read-once — never auto-retry them.
- The gateway (tool-parse `deploy-web-1` on `localhost:7100`) verifies Turnstile, injects `x-proxy-secret`, and owns identity cookies. This app only ever calls same-origin `/v1` — browser never sees proxy secrets.
- Production/local compose requires `PROXY_SECRET`; it is consumed from the operator secret store, not from container env output. Never print or commit its value.
- Compose build requires `VITE_TURNSTILE_SITEKEY`; do not use the Cloudflare test key from `/mnt/docker-ssd/romeshh/sites/tool-parse/web/app/.env.development` for a real deployment. The frontend key must match the gateway's Turnstile secret and public hostname configuration.
- The gateway validates every upload token, including the synthetic sample, against `TURNSTILE_SECRET_FILE`, `TURNSTILE_ALLOWED_HOSTNAMES`, and `TURNSTILE_ACTION=tool_parse_upload`. A mismatched/test frontend key produces `human verification not accepted` before processing.
- Production `VITE_TURNSTILE_SITEKEY` and `TURNSTILE_ALLOWED_HOSTNAMES` must come from the deployment/operator secret configuration; never guess, commit, or print them. Pass only the variable values.
- Deploy and rebuild through the unified stack, not this repo's own Compose (see Unified deployment canon above). Verify the `web` service in `app-lawyerlab` is `Up` via `docker compose ps`, `http://127.0.0.1:7200/mvp/` returns HTTP 200, and perform an authenticated/sample upload smoke test; HTTP 200 alone does not prove Turnstile or processing works.

## Conventions

- Design tokens are `--ll-*` in `src/styles/tokens.css` (imported by `src/index.css`), seeded from tool-parse's `--lx-*` palette but deliberately renamed. Don't reintroduce `--lx-*`.
- Commit messages: conventional type prefix, lowercase, one line (`feat:`, `docs:`, `test:`, `chore:`, `fix:`).
- UI class names match tool-parse's `index.css` (`.app-shell`, `.site-header`, `.brand-mark`, `.config-panel`, …).

## Adding a workflow

For exposing an already wired workflow on another surface or workspace, follow [the surface registration guide](docs/adding-wired-workflow-to-surface.md).

Two repos, linked only by the `/v1/workflows` HTTP contract. Read in order: tool-parse `docs/ADR-007-workflow-template.md` (backend template, lanes, checklist), then `docs/adr/0006-workflow-template.md` here (presentation template, "Shared building blocks"), then `DICTIONARY.md` ("Code map"). Background only if relevant: tool-parse ADR-006 (public contract, identity exception), ADR-008 (protected pipeline, Proposed), ADR-009 (raw lane); `docs/adr/0005` here (why bespoke pages are the exception).

1. Run the interview first (ADR-007 Part A, ADR 0006). Ask the user on any unknown. Never default identity, guest access, PII profile or `off`; public identity and guest access need explicit sign-off.
2. Pick the lane from the ADR-007 table. It fixes the builder and handling shape. `selectable` handling shows a picker and sends `workflow_settings`.
3. Backend (tool-parse): catalog entry and builder in `src/catalog.js`; job workflows add `workflows/<id>/manifest.json`; pipeline jobs add a processor in `src/pipeline/` wired into `orchestrator.js`. Synthetic fixtures only (`git add -f`). Known blocker: the native-manifest check in `src/jobs/workflows.js` pins `contract-review`; generalize it before a second pipeline workflow.
4. Frontend (here): `WorkflowId` and `CATALOG` entry with `backendId`, add to the `src/surfaces/` profile, register a `job` panel in `workflowPanels.ts` with an `accepts` guard in `api.ts`. Reuse the shared blocks (`WorkflowShell`, `FileIntake`, `useWorkflowJob`, `HumanVerification`); an `own-frame` page needs a stated reason in the PR. Don't re-implement Turnstile or `workflow_settings`, and read file types, input modes and samples from the catalog. Don't add to the guest list in `Playground.tsx` without sign-off.
5. Deploy config: add the id to `TOOL_PARSE_WORKFLOW_ALLOWLIST` in `~/sites/site-lawyerlab/deploy/unified/compose.yml`, or `/v1/workflows` won't list it.
6. Verify: `npm test` in tool-parse; `npm test && npm run build` here; rebuild only via `~/sites/site-lawyerlab/deploy/unified/up.sh`; `curl localhost:7100/v1/workflows` lists the id with no `binding` or `shadow`; authenticated smoke upload with a synthetic PII file (HTTP 200 alone proves nothing).
7. Stage only your own files; tool-parse often has others' uncommitted work.

Gotchas: tests spying on `fetch` see `/v1/workflows` as an extra call; result endpoints are read-once; `MultiFileIntake` is the input-method radio group, not a multi-file uploader; reference the other repo by name, never `../`; amend a stale ADR in the same change.

## Pitfalls

- Port clash: 7100 is the tool-parse gateway; 7200 is this dev server. Other MCP servers live on 8100/8111 — don't reuse.
- `.gitignore` bans `*.pdf` / `*.docx`; the two synthetic fixtures in `tests/fixtures/` are force-added. New fixtures need `git add -f` — never commit real client documents.
- The upstream service is the deployed tool-parse docker stack; contract behavior is verified against it, not against `docs/CONTRACT.md` in the tool-parse repo (which describes the conversion pipeline, not the gateway HTTP API).
- `index.html` still has the inherited "Tool Parse" title — rename carefully; the app copy in `src/` already says LawLabs.
