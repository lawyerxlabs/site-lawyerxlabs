# LawyerLab access and pricing model

**Status:** Active decision record. Covers what is decided, what is deferred, and what must not ship until explicitly approved. Companion to `docs/API-CONTRACT-v2.md` (gateway limits) and `docs/TRUST-CLAIMS.md` (verified trust language).

Research input: `docs/research/datalab-pricing.md` (Datalab primary-source review, 2026-10-19).

---

## Principles

**1. Limits gate access; capabilities do not.**
Every tier gets every LawyerLab tool. Tiers differ only in how much a user can do per day and how long outputs are retained. This matches the verified Datalab pattern and is already implemented in the gateway.

**2. Dollar amounts, not abstract credits.**
If and when billing exists, denominate it in dollars. A lawyer attributing cost to a matter needs "you used $3.40 this month," not "you have 660 credits remaining." Abstract credits add conversion confusion without benefit.

**3. No card surprise.**
A free-tier user must never be charged without an explicit billing step. Any overage model requires a hard spend cap before card-on-file is required. HTTP 402 on cap breach is the correct pattern (Datalab-verified).

**4. Privileged material constraint.**
LawyerLab handles documents that may be subject to solicitor-client privilege. Do not offer retention-for-discount. Do not offer data-use agreements that imply training on submitted content. Any trust claim about data handling must be verified in `docs/TRUST-CLAIMS.md` before it appears in copy or pricing language.

**5. No BAA.**
BAA is a US healthcare compliance concept (HIPAA). It does not apply to Canadian legal practice. Do not reference it.

---

## Current access model (live)

Two tiers, gateway-enforced. LawLabs reflects limits from `/v1/me`; it never computes or enforces them.

| Limit | guest | auth |
|---|---|---|
| Jobs per UTC day | 3 | 25 |
| Max file size | 10 MiB | 10 MiB (product ceiling for all tiers) |
| Max pages per job | 10 | 250 |
| Output retention | 60 min | 24 h |

Source: `docs/API-CONTRACT-v2.md`. Initial values — tune from real usage data.

**What triggers each tier:**
- `guest`: anonymous identity cookie set by the gateway. No login. Today's behavior.
- `auth`: gateway-issued session after OIDC login. LawLabs never sees tokens; the gateway owns the session cookie.

**What auth currently requires:** identity cookie upgrade at the gateway. Account creation (email + password) is not yet required. This is a known gap — see Deferred below.

---

## What the research confirms LawyerLab should adopt

### Recurring free allowance, not a one-time trial

Datalab changed from a one-time $5 credit to a monthly $10–20 recurring allowance in June 2026. The reason is usage pattern: professionals evaluate tools across real work over weeks, not in a single session.

LawyerLab's current model already matches this intent: the guest tier resets daily (UTC day), the auth tier has a higher daily limit, and both are free. No change needed now.

**Future signal:** if a paid tier is introduced, the free allowance should remain meaningful and recurring — not a one-time trial that expires.

### Per-job usage visibility

Datalab's API responses include a `cost_breakdown` field. Even without billing, this is a useful pattern. A lawyer preparing documents for AI should see:

- pages processed
- output expiry time (already in `expires_at`)
- what was found (already in the redaction report)

No cost field exists yet, but the readout pattern from `docs/DESIGN.md` applies: show `N pages · expires HH:MM` in the result workspace using `tnum` + mono styling.

### Spend cap before overage

When billing exists, every API key (or account) should carry a configurable spend cap. Exceeding it returns an error, not a charge. The user must explicitly raise the cap or add a payment method. This protects a sole practitioner from accidental runaway usage.

---

## What does not translate from Datalab

| Datalab pattern | Reason it doesn't fit |
|---|---|
| Per-1,000-page rate card ($0.50–$20/1k pages) | LawyerLab's tool is bounded at 10–250 pages/job. Per-page billing at that scale produces sub-cent amounts that can't be invoiced cleanly. Flat tiers work better. |
| $400/mo Team plan | Wrong magnitude for a Canadian sole practitioner. |
| Retention-for-25%-discount | Incompatible with solicitor-client privilege. A lawyer cannot trade document retention for a price break. |
| Per-processor additive billing | LawyerLab exposes one bounded workflow, not a composable processor API. Additive pricing has no surface to apply to. |
| Rate limits as plan differentiator (25 vs 400 req/min) | LawyerLab's audience makes sequential single-document requests. Rate limits here are anti-abuse controls, not plan features. |
| BAA | US healthcare. Not applicable. |
| Custom processor creation | Not exposed publicly. |

---

## Deferred decisions

### What triggers the auth tier

Currently: identity cookie upgrade. The open question is whether `auth` eventually requires:

- **Email verification only** — user provides email, gateway verifies, no password.
- **Account creation** — email + password (or SSO via Logto).
- **Paid commitment** — card on file or subscription purchase.

**Recommended path when auth account creation ships:**
- Email-verified account → unlocks auth limits (higher daily cap, 24h retention). Free.
- Card-on-file → unlocks overage or a future paid tier. No charge until explicitly agreed.

This matches the Datalab two-step (free allowance → card for overage) adapted to LawyerLab's flat-tier model.

Decision required before shipping account creation. Do not ship a login flow until the auth trigger is agreed.

### Paid tier structure

No paid tier is defined yet. When it is, the recommended shape:

```text
Guest (anonymous)
  → 3 jobs/day, 10 MiB, 10 pages, 60 min retention
  → no login required

Standard (email-verified)
  → 25 jobs/day, 10 MiB, 250 pages, 24 h retention
  → free; requires account creation

Pro (paid, flat monthly)
  → higher limits TBD from usage data
  → dollar amount TBD; not per-page
  → spend cap required before billing starts
```

Do not define Pro limits or pricing until guest/standard usage data exists.

### Per-job cost display

Once billing exists, the result workspace should display a plain cost line:
> `N pages processed · $X.XX`

No cost display until a billing surface exists. The page-count readout (already available from job metadata) can ship sooner as a usage signal without any cost association.

### Waitlist as early-access gate

The waitlist (currently a disabled CTA) can serve as an early-access gate for the Standard tier before public account creation ships. Waitlist subscribers get an invite link → account creation → auth limits.

Decision required: whether waitlist operates as a gate or as a notification list only.

---

## What must not ship without explicit approval

| Item | Reason |
|---|---|
| Any claim about data not being used for training | Not verified in `docs/TRUST-CLAIMS.md`. Requires ops and legal review. |
| "Private processing" as a standalone marketing claim | Blocked in `docs/TRUST-CLAIMS.md` pending operational review. |
| A specific dollar price for any tier | No usage data yet. Pricing before data = speculation. |
| A discount tied to document retention | Incompatible with privilege. |
| BAA language | Not applicable. |
| A billing surface | Requires payment provider integration, spend caps, and a clear auth trigger — none of which are scoped yet. |

---

## Document references

- `docs/BRANDING.md` — naming, voice, positioning
- `docs/DESIGN.md` — token specs, chip patterns, numeric readout style
- `docs/TRUST-CLAIMS.md` — verified trust language with code-level evidence
- `docs/API-CONTRACT.md` — frozen MVP gateway contract
- `docs/API-CONTRACT-v2.md` — proposed guest/auth tier limits and `/v1/me` contract
- `docs/research/datalab-pricing.md` — Datalab primary-source pricing research
