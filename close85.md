Closing on an interim basis. Evidence gathered 2026-11-02 against live analyzer at localhost:8010 (Presidio), local only, no LLM provider, no text egress.

**Idempotence (live analyzer):** 5/5 postings pass `screen(screen(x)) == screen(x)`. All accepted (no Category 1 rejection). This closes the only idempotence gap that synthetic tests could not cover.

**Rule table:** deterministic phrase rules and numbering for `[Person N]`, `[Reporting manager]`, `[Hiring contact]`, `[Team member]`, `[Email N]`, `[Address N]`, `[Date N]`, `[Detail N]` are implemented at `171d011` and covered by role-rules-synthetic and screening tests.

**Deferred to #101 (Gate 13, blocks #88):**
- `[Employer]` rule decision
- Recall and false-positive rates (reviewer diff in progress; n=5, anecdotal only; Location tokens ran 5-12 per posting suggesting over-redaction)
- PDF extraction path not tested (all samples were `.md`)
- Authorized sample thresholds not set
- Five-person cap not implemented (from tech spec; was not a #85 done-when item)

**Scope note:** real-document use remains unauthorized for production. The interim close records what was verified; it does not constitute release approval. Release gate is #88.
