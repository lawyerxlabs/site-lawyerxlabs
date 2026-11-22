# ADR 0007: Unified deployment ownership

**Status:** Accepted (2026-10-31; cutover completed 2026-10-31)
**Date:** 2026-10-31
**Applies to:** LawyerLab's unified Compose deployment
**Implementation:** Cutover completed 2026-10-31; current runtime state requires separate verification. See [deployment guide](../../deploy/unified/README.md).
**Last verified:** Cutover recorded 2026-10-31; current runtime not verified by this record.
**Review triggers:** Changes to deployment ownership, Compose project identity, persisted resources or rollback procedure.

## Context

The combined LawyerLab stack builds the frontend and auth server from site-lawyerlab and the API and gateway from tool-parse. Its canonical configuration currently lives in the separate app-lawyerlab repository. Maintaining that separate deployment repository adds coordination for changes to the product stack.

## Decision

Move ownership of the unified deployment configuration into `deploy/unified/` in site-lawyerlab. Preserve the `app-lawyerlab` Compose project name and existing named volumes and networks. Tool Parse remains a separate source repository. Preserve existing validation of secrets, internal networking, the clean main worktree, and the Tool Parse web build.

The configuration initially uses the existing app-lawyerlab operator environment file; secret values are not transferred into tracked files. The existing launcher remains the operational path until cutover succeeds and remains a rollback path afterwards. See `deploy/unified/README.md` for cutover and rollback.

## Alternatives considered

- Keep the separate deployment repository: preserves a distinct operational boundary, but requires another repository for this product's composition.
- Change the Compose project name during the move: rejected because it would select different project-scoped resources and risk disconnecting existing data.

## Consequences

Site-lawyerlab owns both presentation source and the combined deployment definition. Changes to tool-parse deployment settings require coordination with this repository. Recreating the stack interrupts service and loses in-memory sessions; existing persistent volumes must remain intact. During transition the two copies must not be changed independently or launched concurrently.
