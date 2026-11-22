# LawyerLab — Product context

**Status:** Active. Source of truth for durable product facts. Visual and design-system decisions live in `docs/DESIGN.md`. Naming, voice, and copy rules live in `docs/BRANDING.md`.

---

## Identity

- **Name:** LawyerLab
- **Domain:** lawyerlab.ca
- **Owner:** Lawtrepreneur
- **Endorsement:** "LawyerLab is a Lawtrepreneur product." Footer and conversion contexts only.

## Platform

Web. Single-page React application served behind an nginx reverse proxy. No native clients planned.

## Audience

**Primary:** Canadian sole practitioners and small-firm lawyers exploring whether and how AI fits their existing legal work.

These users are cautious, professionally liable, and evaluating risk before adoption. They are not developers, not enterprise, and not seeking a generic AI chat product.

## Business outcome

Validate demand for bounded legal AI workflows and generate qualified Lawtrepreneur implementation engagements. LawyerLab is the free exploration surface; Lawtrepreneur owns paid strategy and implementation work. LawyerLab must not promise or imply independent paid services.

## Product scope

A catalogue of bounded AI workflow tools. Each tool is a self-contained workflow the lawyer can complete in one session: upload → process → review output.

Current tool: **Prepare a document for AI** (document redaction MVP). Future tools follow the same pattern: bounded, single-session, output-reviewed.

The playground routes (`/playground/*`) are the shared workflow workspace used by customer-facing surface profiles. `/mvp/` remains the LawyerLab landing and document-preparation MVP.

## Success signal

**Completed workflow plus reviewed output.** The user uploads a document, the service processes it, and the user reviews the redacted output and entity report. Secondary: waitlist sign-up (currently disabled pending collection endpoint).

## Architecture boundary

LawyerLab is a product shell. It calls the self-hosted `tool-parse` service over HTTP (`/v1`). It never imports tool-parse source or treats it as a dependency. The gateway owns identity (anonymous cookie), Turnstile verification, and proxy credentials. LawyerLab only ever calls same-origin `/v1`.

API contract is frozen for the MVP (`mvp-2026-10-19`). A v2 draft adds identity tiers (guest/auth) but is not yet shipped.

## Trust constraints

Copy must be substantiated by verified service behavior or a recorded operator attestation. See `docs/TRUST-CLAIMS.md` (reviewed 2026-10-22) for each claim's evidence, caveats, and the approved/unapproved list.

Approved (see the trust record for scope):
- "Source files are deleted after processing."
- "Outputs are temporary and ready for your review."
- "Automated detection is best-effort. Review outputs before use in your practice."

Not approved:
- "Private processing" as an unqualified marketing claim.
- Promised deletion times unless sourced from the job's `expires_at`.
- Claims about backups, administrator access, geographic location beyond the Canadian-processing attestation, or confidentiality guarantees.

## Voice

Grade 9 reading level. Practical colleague with clinical authority. Clear, calm, measured, direct. Opportunity first; risks and safeguards immediately follow. No hype, urgency, jargon, or "transform your practice."

## Routes

| Route | Surface | Audience |
|---|---|---|
| `/mvp/` | Document preparation workflow | Customer |
| `/playground/` | Developer upload + config | Internal |
| `/playground/jobs/:jobId` | Developer result explorer | Internal |
| `/` | Redirects to `/mvp/` | — |
| `/app/*` | Legacy redirects to playground | — |

## Dev environment

- Vite dev server on `127.0.0.1:7200`, proxies `/v1` → `localhost:7100` (tool-parse gateway).
- `npm run dev` / `npm test` (vitest) / `npm run build` (tsc + vite → `dist/`).
- No `.env` in repo; `.env*` gitignored except `.env.example`.

## Design system

Tokens in `src/styles/tokens.css` use `--ll-*` prefix. Full design reference in `docs/DESIGN.md`. Components in `src/components/ui/` follow shadcn-style owned-source architecture with CVA variants. Radix primitives are being adopted for interaction behavior; visual appearance stays with brand tokens.
