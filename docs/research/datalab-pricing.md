---
title: Datalab (datalab.to) pricing and credits model
date: 2026-10-19
purpose: Input for LawyerLab pricing/access model design
method: Primary sources only (first-party pricing page, docs, changelog). No secondary write-ups.
sources_reviewed:
  - https://www.datalab.to/pricing
  - https://documentation.datalab.to/platform/billing.md
  - https://documentation.datalab.to/docs/common/limits.md
  - https://documentation.datalab.to/platform/errors.md
  - https://documentation.datalab.to/platform/changelog.md
  - https://documentation.datalab.to/platform/security.md
  - https://documentation.datalab.to/docs/on-prem/overview.md
  - https://documentation.datalab.to/docs/recipes/pipelines/custom-processors.md
  - https://documentation.datalab.to/index.md
  - https://documentation.datalab.to/llms.txt
---

# Datalab pricing and credits model

Labels used below: **Verified** = stated on a first-party page (URL cited). **Inference** = my reading, not stated. **Unverified** = not found in a primary source.

## 1. Plan tiers

Three tiers. All run the full hosted API and SDK and **all processors at the same rate card**. Plans differ in limits, compliance, deployment and support, not in feature or processor access. (https://www.datalab.to/pricing)

| | Free | Team | Enterprise |
|---|---|---|---|
| Price | $0/mo, pay-as-you-go | $400/mo | Custom |
| Included monthly usage | $20 (work email) / $10 (personal email) | $400 | Custom |
| Invoicing | "Every $15, or monthly" | "Every $1,000, or monthly" | Custom terms |
| Rate limit (req/min) | 25 | 400 | Custom |
| Concurrency | 25 | 400 | Custom |
| Custom-processor creations / mo | 1 | 4, then $5 each | Custom |
| Volume discounts | no | no | yes |
| SOC 2 Type II report | yes | yes | yes |
| BAA / DPA | no | yes | yes |
| EU data residency | 1.25x usage | 1.25x usage | Custom |
| Admin MFA enforcement | no | yes | yes |
| SSO | no | no | yes |
| Own VPC | no | no | yes |
| Fully air-gapped | no | no | yes |
| Support | Community | Email + Slack | Dedicated |
| MSA / SLA | no | no | yes |

Source for the whole table: https://www.datalab.to/pricing

- The billing doc describes Team as "$400 of monthly usage (same per-page rates)", production rate limits, clickthrough BAA/DPA, SOC 2 report, and additional custom-processor capacity. (https://documentation.datalab.to/platform/billing.md)
- Seats: **Unverified.** No seat count or per-seat price appears on the pricing page or billing doc. Billing is per team/account, not per seat. Admin MFA and SSO are listed as features, not seat-priced. (Inference from absence.)
- Inference on "Invoicing: Every $15 / Every $1,000, or monthly": looks like threshold billing (invoice when accrued usage hits that amount, or at month end, whichever first). The page does not explain it.
- Team's $400 fee is entirely usage credit ($400 included usage for $400), so it works as a prepaid commitment that unlocks higher limits and compliance features. It is not a discount on usage. (Inference from https://www.datalab.to/pricing and https://documentation.datalab.to/platform/billing.md)

## 2. Credits system

- The billing doc says "Every API request consumes credits based on the number of pages processed." Credits are denominated in **dollars**: the allowances are "$20", "$10", "$400", and charges are "rounded up to the nearest cent". No abstract credit unit or conversion table is published. (https://documentation.datalab.to/platform/billing.md) (Inference: "credits" is a synonym for dollar balance.)
- Unit of consumption is **per page, per processor**. Each processor has "its own flat rate per 1,000 pages". (https://www.datalab.to/pricing)
- Processors are **additive**: "if you convert and then extract the same document, you pay for each step separately." (https://documentation.datalab.to/platform/billing.md)
- Page definition: PDF = each page; image = 1 page; Office doc = each page; multi-page TIFF = each frame. (https://documentation.datalab.to/platform/billing.md)
- Spreadsheets bill by cells: simple mode 2,500 cells/page, capped at 100 pages ($0.60) per sheet; advanced mode 500 cells/page, no cap; multi-sheet files are computed per sheet and summed. (https://documentation.datalab.to/platform/billing.md; same note in the pricing page footnotes)
- Some processors add **compute-based** charges on top of or in place of page rates:
  - Cross-page merging (beta): no per-page rate, only a variable compute surcharge, "typically a few cents per document".
  - Balanced/accurate extraction: about 5% of requests bill above the fixed rate; when compute applies the charge is the **higher of** page-based and compute-based, not the sum. Schemas over 750 fields are unsupported.
  - Form fill and agent processors: rate is a floor; unusually demanding documents bill actual cost instead.
  - Sources: https://www.datalab.to/pricing (footnotes `*`, `**`, `‡`) and https://documentation.datalab.to/platform/billing.md
- Transparency: the completed API response includes `cost_breakdown` showing the billed amount. (https://documentation.datalab.to/platform/billing.md)
- Usage is visible in a dashboard (real-time, "may be slightly delayed") with a breakdown by processing type. (https://documentation.datalab.to/platform/billing.md)
- Legacy: signups previously got $5 free credits (changelog 12/3/2024) and cancelled subscribers kept credits until month end (changelog, 10/31/2024 entry). (https://documentation.datalab.to/platform/changelog.md)

## 3. Free tier / trial

- Monthly allowance, **no credit card required**: $20 for a work email, $10 for a personal email. (https://documentation.datalab.to/platform/billing.md; https://www.datalab.to/pricing)
- "Credits reset at the start of each 30-day cycle." So the allowance is **use-it-or-lose-it, recurring**, not a one-time trial. (https://documentation.datalab.to/platform/billing.md)
- Limits: up to 10 requests/min per billing doc (see rate-limit conflict in section 7). Stated purpose: "run a complete proof of concept before committing to a paid plan." (https://documentation.datalab.to/platform/billing.md)
- Free tier includes SOC 2 report, 1 custom-processor creation/month, community support only, no BAA/DPA. (https://www.datalab.to/pricing)
- Launched 2026-06-18, replacing the one-time $5 signup credit. (https://documentation.datalab.to/platform/changelog.md, 6/18/2026 entry)
- Stale docs: the welcome page and the custom-processors page still say "New accounts include $5 in free credits". (https://documentation.datalab.to/index.md; https://documentation.datalab.to/docs/recipes/pipelines/custom-processors.md) The pricing page and changelog supersede these.
- Other credit programs: **migration credits** "up to $5,000" for people switching from another provider (by application); **startup program** 33% off per-page rates and Team fee for 12 months (under 3 years old, under $15M raised, under $5M ARR, document processing core to product). (https://www.datalab.to/pricing)

## 4. Overage model

- **Free tier, after allowance:** "add a payment method and switch to pay-as-you-go. There is no subscription, no plan to choose, and no minimum spend." (https://documentation.datalab.to/platform/billing.md) The pricing page labels Free as "$0 pay-as-you-go". (https://www.datalab.to/pricing)
- **Free tier with no card, allowance exhausted:** behavior **Unverified**. No primary page states whether requests are rejected, queued or throttled. Inference: hard stop, but not documented.
- **Team beyond $400 included usage:** **Unverified.** The docs say Team includes "$400 of monthly usage (same per-page rates)" but do not state what happens past it. Inference: continues at list rates. The invoicing row ("every $1,000, or monthly") hints at threshold billing for usage beyond the commitment.
- **Spend cap:** each API key has a configurable 30-day spend cap. At the cap the API returns **HTTP 402 `spend_cap_error`** (non-retryable); raised in billing settings. (https://documentation.datalab.to/platform/errors.md; changelog 6/22/2026 moved this from a misleading 401 to 402)
- **Payment failure:** account goes `unpaid`; a **24-hour grace period with a usage cap**; then API access is blocked until payment is resolved. Email notification via Stripe. (https://documentation.datalab.to/platform/billing.md)
- **Rate limit overage:** HTTP 429, retryable; SDK auto-retries with backoff. (https://documentation.datalab.to/platform/errors.md; https://documentation.datalab.to/docs/common/limits.md)
- **Page-concurrency overage:** not a 429. The request is accepted, then returns `success: false` with a "Page rate limit exceeded" error if more than 5,000 pages are in flight. (https://documentation.datalab.to/docs/common/limits.md)
- Per-custom-processor creation beyond the plan allowance: $5 each on Team. (https://www.datalab.to/pricing)

## 5. Enterprise / VPC / air-gapped signals

- Enterprise tier is "Custom processing solutions — on our API or your infrastructure, with custom terms." It adds SSO, own-VPC, fully air-gapped, MSA/SLA, dedicated support, volume discounts, custom limits. **No numeric price published.** (https://www.datalab.to/pricing)
- On-prem requires "an Enterprise contract" via a contact form. Billing: "Invoice/PO, custom terms. For small deployments we offer credit card checkout." Scale: custom page counts, custom rate limits; "optimized single-GPU support" for small deployments. (https://documentation.datalab.to/docs/on-prem/overview.md)
- On-prem is positioned for: data privacy / highly regulated environments, very high volume, model training/customization, white-glove support/SLAs. It offers access to newer models than the open-source weights. (https://documentation.datalab.to/docs/on-prem/overview.md)
- Open-source path: Marker, Surya, Chandra. Weights free for research/personal use. Commercial use is free only below **both** prior-year gross revenue and total funding thresholds: $2M for Chandra, $5M for Marker and Surya. Above that, a commercial license is needed. The license also bars use by anyone offering a product that competes with Datalab. (https://documentation.datalab.to/docs/on-prem/overview.md)
- On-prem price per page, GPU or seat: **Unverified.** The billing page card links "pricing for on-prem and cloud plans" but the billing page itself contains no on-prem pricing.
- Concurrency ceiling hint: sustained high-volume loads hitting the 5,000 pages-in-flight limit are pointed to "an enterprise agreement or a batch job that we orchestrate for you". (https://documentation.datalab.to/docs/common/limits.md)

## 6. Per-processor pricing

Rates are per 1,000 pages (USD), flat across plans. (https://www.datalab.to/pricing)

| Processor | $/1,000 pages | $/page |
|---|---|---|
| Convert, fast / balanced | 4 | 0.004 |
| Convert, accurate | 10 | 0.010 |
| Segment, page level (ranges + titles only, no OCR text) | 0.5 | 0.0005 |
| Segment, block level (also returns markdown, "runs Convert too") | 4.5 | 0.0045 |
| Extraction, turbo / fast | 6 | 0.006 |
| Extraction, balanced | 15 + fees | 0.015 |
| Extraction, accurate | 20 + fees | 0.020 |
| Custom processor | 20 | 0.020 |
| Agent processor (successor to custom processors) | 10 (floor) | 0.010 |
| Eval (score output against a rubric) | 2 | 0.002 |
| Form fill | 10 (floor) | 0.010 |
| Create document | 6 | 0.006 |
| Form fields (find fillable fields) | 3 | 0.003 |

Add-ons (per 1,000 pages, on top of base):

| Add-on | $/1,000 pages |
|---|---|
| Track changes (diff Word revisions) | 6 |
| Chart understanding | +3 |
| Infographic | +4 |
| Word bounding boxes | +3 |
| Table cell bounding boxes (includes word) | +6 |
| List bounding boxes (includes word) | +6 |
| Word + table cell + list bounding boxes | +9 |
| Cross-page merging (beta) | variable compute only |

Modifiers, all from https://www.datalab.to/pricing:
- EU processing: **+25%** on the summed total (also shown as "1.25x usage").
- Data-retention opt-in: **-25%**. Startup program: **-33%**. "A single discount can also apply... the two discounts can't both apply."
- Price change: extraction accurate cut from $25 to $20 per 1,000 pages on 8/30/2026. (https://documentation.datalab.to/platform/changelog.md)

Illustrative arithmetic from the rate card (mine, not published): a 50-page document costs $0.20 to convert fast, $0.50 convert accurate, $0.95 convert plus balanced extract (4 + 15 per 1,000 pages x 50). Charges round up to the cent per request.

## 7. Rate limit and quota signals

- File size: 200 MB for PDFs, images and Office docs. Max 7,000 pages per request; use `page_range` to split. (https://documentation.datalab.to/docs/common/limits.md)
- Request rate limits (docs): Free **10 req/min, 5 concurrent**; Team **200 req/min, 400 concurrent**. (https://documentation.datalab.to/docs/common/limits.md)
- Request rate limits (pricing page): Free **25 req/min, 25 concurrency**; Team **400 req/min, 400 concurrency**. (https://www.datalab.to/pricing)
- **The two first-party pages conflict.** The billing doc also says Free is "up to 10 requests per minute", agreeing with the limits doc. The pricing page is the outlier, and may be newer. Unresolved; treat all numbers as unreliable until Datalab reconciles them.
- Page concurrency: 5,000 pages in flight per team, enforced during processing, surfaced as `success: false` rather than HTTP 429. (https://documentation.datalab.to/docs/common/limits.md)
- Changelog shows limits being raised over time ("Bump concurrency/rate limits to 200", 10/31/2024 entry). (https://documentation.datalab.to/platform/changelog.md)
- HTTP codes: 402 spend cap (non-retryable), 403 permission or subscription issue, 429 rate limit (retryable), 529 overloaded (retryable). (https://documentation.datalab.to/platform/errors.md)

## 8. Billing basis: usage vs seat vs page

- **Page-based and usage-based, metered per processor.** Not seat-based (no seat pricing found). Plans gate limits and compliance, not capabilities. (https://www.datalab.to/pricing; https://documentation.datalab.to/platform/billing.md)
- The only subscription is Team, which is a prepaid usage commitment of equal size. (Section 1.)
- Enterprise and on-prem are contract/invoice, with volume discounts. (https://www.datalab.to/pricing; https://documentation.datalab.to/docs/on-prem/overview.md)
- Data retention and results: results are auto-deleted about one day after processing; `DELETE /api/v1/results/{request_id}` removes sooner. Retention for model improvement is opt-in and discounted. (https://documentation.datalab.to/platform/security.md)

## What translates to LawyerLab, and what does not

All of this section is my inference from the findings above, not Datalab's claims.

**Patterns that translate**
- **Dollar-denominated allowance, not abstract credits.** Datalab's "credits" are just dollars. This avoids a conversion table and stays honest when per-unit costs change (they cut extraction accurate 20% without touching plans).
- **Recurring free allowance, no card.** Fits a sole practitioner trying one real document before committing. A monthly reset (rather than a one-time trial) keeps a low-volume user coming back.
- **Additive, per-step metering with a per-request cost breakdown.** For lawyers who bill clients, a visible per-document cost they can attribute to a matter is a strength. Datalab's `cost_breakdown` is the model.
- **Capabilities identical across plans; tiers gate limits and trust features.** Simple to explain and avoids feature-gating friction.
- **Spend cap with a distinct error code (402), and a grace period on failed payment** (24h with a usage cap before block). Cheap safety for a small firm.
- **Region surcharge.** Datalab charges +25% for EU processing. A Canadian-residency option is the analogue if LawyerLab ever offers multiple regions. Whether to charge for it is a product call.
- **Read-once, short-lived results** (Datalab deletes after about 1 day, with explicit delete). This is consistent with LawyerLab's existing read-once result contract in `docs/API-CONTRACT.md`.
- **Block compute surprises:** Datalab's "higher of rate or compute, never both" rule, plus disclosing that about 5% of requests bill above rate, is a reasonable way to handle variable-cost work without bill shock.

**Patterns that do not translate**
- **Per-1,000-page rate card and processor names.** Datalab sells infrastructure to developers who know "convert", "segment", "extract". Lawyers think in documents and matters. LawyerLab would need to translate to something like per-document or per-redaction-job pricing.
- **$400/mo Team tier.** Priced for production engineering teams. Sole practitioners and small firms are unlikely to commit at that level. (Price-point fit is judgment, not tested.)
- **Retention-for-discount.** Datalab discounts 25% if you let it use your documents to improve models. For privileged legal material that is a non-starter; LawyerLab should treat no-retention as the default and a trust claim (see `docs/TRUST-CLAIMS.md`), not a discount lever.
- **Startup, migration-credit and open-source licensing programs.** Aimed at venture-backed builders; no obvious equivalent for lawyers.
- **API rate-limit tiers (requests/min).** Matter for integrators; a UI-driven product mostly needs fair-use limits, not per-minute quotas sold as plan features.
- **Enterprise VPC / air-gapped.** Relevant to LawyerLab only as an eventual large-firm option. Datalab shows these as contract-only with no published price, which is the norm.
- **SOC 2 and BAA/DPA.** BAA is a US healthcare construct. The Canadian equivalents (privacy-law and law-society expectations) are outside this research and need separate checking.

**Cost-floor note:** Datalab's published rates imply roughly $0.004 to $0.02 per page (convert to accurate extract). If LawyerLab ever used a vendor like this upstream, per-document margins are easy to compute. LawyerLab's own stack calls the self-hosted tool-parse service, so this is reference only. (Inference, from `AGENTS.md` architecture.)

## Gaps and unverified items

- Behavior when the Free allowance is exhausted with no card on file: not stated.
- Behavior and pricing when Team usage exceeds the included $400: not stated.
- Seat counts or seat pricing: none found.
- On-prem and Enterprise numeric pricing: not published.
- Free/Team rate limits: pricing page and limits doc disagree (section 7).
- Welcome and custom-processors pages still say $5 free credits (stale versus current $20/$10).
- Not reviewed: `https://documentation.datalab.to/docs/welcome/api.md` endpoint pages, terms of service, the in-app billing dashboard (login required), and the pricing page's interactive cost estimator beyond its static text. The pricing page was read as text extracted from fetched HTML; the interactive widgets were not exercised.
- No `platform/data-retention` or `platform/spend-cap` pages exist (both returned 404); spend-cap details come only from the errors page and changelog.
