# MVP manual smoke test

Use operator-provided production configuration. Never print, commit, or record secret values.

## LawyerLab build

- [ ] Deploy with `cd ~/sites/site-lawyerlab/deploy/unified && ./up.sh`, supplying `PROXY_SECRET` and `VITE_TURNSTILE_SITEKEY` through the approved secret/environment mechanism (names only; do not paste values into command history).
  - Expected: the stack recreates the web service using matching production Turnstile configuration.
- [ ] Verify `app-lawyerlab-web-1` is `Up` (`docker ps --format '{{.Names}}' | grep app-lawyerlab-web`).
  - Standalone compose in this repo is for isolated diagnostics only; the canonical deploy is `~/sites/site-lawyerlab/deploy/unified` (see docs/POINTERS.md).
  - Expected: `Up`.
- [ ] Request `http://127.0.0.1:7200/mvp/`.
  - Expected: HTTP 200 and MVP page renders.
- [ ] Inspect page identity and copy.
  - Expected: LawyerLab favicon, title, and LawyerLab copy; no inherited Tool Parse branding.
- [ ] Open `/mvp/` on `lawyerlab.ca`.
  - Expected: MVP is reachable on production hostname.
- [ ] Complete authenticated/sample upload with valid human verification.
  - Expected: Turnstile is accepted, upload is processed, and a job is created. HTTP 200 alone is not proof of success.
- [ ] Open the created `/playground/jobs/:id` page.
  - Expected: lifecycle/status is shown; completed result loads. Result endpoints are read once and are never auto-retried.

## Signal Lawyers build

- [ ] Build/deploy with `VITE_SURFACE=signal-lawyers` and matching production Turnstile configuration.
  - Expected: Signal Lawyers branding and workflow are active.
- [ ] Open `/mvp/`.
  - Expected: redirects to `/playground/?workflow=transaction-intake`; Signal favicon is shown.
- [ ] Open a job page at `/playground/jobs/:id` without `?workflow=`.
  - Expected: the job renders with the Alias (`alias-doc`) workflow; no `workflow` param resolves to `alias-doc`, which is enabled on this profile.
