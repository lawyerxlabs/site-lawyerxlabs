# ADR NNNN: Short title

<!--
Template for new ADRs. Copy this file, rename to NNNN-kebab-case-title.md,
and replace every NNNN and bracketed placeholder. Delete sections that do
not apply; never leave empty sections in the finished ADR.
-->

**Status:** Proposed
<!--
One of: Proposed · Accepted (YYYY-MM-DD) · Deprecated · Superseded by ADR NNNN.
Accepted entries may carry an amendment note: "Accepted (YYYY-MM-DD; amended YYYY-MM-DD for …)".
-->

**Date:** YYYY-MM-DD
<!--
Date of the last substantive change to the decision, not the file.
Amendments that add context but do not change the decision stay inside
the ADR as an "Amendment (YYYY-MM-DD):" section, like ADR 0001.
-->

**Applies to:** [scope in one line: systems, routes, workflows. State what is explicitly out of scope.]
**Relates to:** [ADR numbers, issues, specs; omit if none.]
**Implementation:** [Not implemented, partial, implemented, or unknown; distinguish deployment if relevant. Identify mixed-state sections.]
**Last verified:** [YYYY-MM-DD and evidence checked, or not verified. State the scope of the check.]
**Review triggers:** [Changes that require this record or its implementation claims to be reviewed.]

## Context

[The problem, forces, and constraints that make a decision necessary.
Grounded facts only: cite files, line numbers, contracts, and issues.
Separate "repo fact" from "requirement" from "assumption"; see ADR 0003.
If the record was drafted without verifying something, say so in a
verification-status line instead of presenting it as fact.]

## Decision

[Numbered, atomic decisions. Each is one statement with its reasoning.
Note intentional divergences from issues or specs ("this corrects issue
#NN's wording") and name the correction. Prefer RFC-2119 language
(must/should/may) for hard requirements.]

## Alternatives considered

### [Alternative name]

Rejected/Deferred. [One or two sentences: why, and what would reopen it.]

## Consequences

**Good**
- [What this buys, including second-order effects.]

**Costs**
- [What this costs, including failure modes and coordination burdens.
  Every cost must have a documented ceiling or a named follow-up.]

## Open questions

- [Question · owner · what would resolve it. Omit section only when the
  decision is fully closed.]

## References

- [Files with paths, issues, specs, and any doc corrected by this ADR.]

<!--
Formatting rules (from docs/adr/ existing records):
- Extra sections are allowed (Invariants, Scope, Rollout, Definition of
  done) but never replace Context / Decision / Consequences.
- Proposed ADRs keep "Proposed" in Status and may title Decision as
  "Decision (proposed)" until accepted; on acceptance, normalize both.
- Never renumber or reuse a number. Preserve ADRs as historical records;
  record changed decisions in a new ADR and link explicit supersession.
-->
