# ADR 0005: Workflow catalog ownership, surface enablement, and shared intake primitives

**Status:** Accepted
**Date:** 2026-10-27
**Amended:** 2026-10-30
**Applies to:** `src/lib/workflows.ts`, `src/surfaces/`, and shared intake UI for compatible single-source workflows  
**Relates to:** ADR 0001 (Common Workflow design), ADR 0004 (HR Onboarding workflow), tool-parse issue #87

## Context

The workflow catalog defines application-level workflow identity and behaviour, while each surface chooses which workflows it exposes. The current shallow surface override can accidentally replace capability fields such as `inputModes` or `uploadId`. It also leaves disabled catalog workflows routable if callers forget to apply the disabled check.

The workflows do not share one backend lifecycle. `transaction-intake` and `docalias` use the single-source `/v1/jobs` family; `transaction-review` uses a dedicated `/tx/v1/sessions` session flow; HR Hiring uses an interactive `/hr/v1` session flow, and HR Onboarding uses a multi-file `/onboard/v1` flow with different token and submission semantics. Treating those as one universal intake contract would either lose validation or force incompatible workflows into the wrong lifecycle.

## Decision

### 1. The catalog owns workflow capability

`GET /v1/workflows` declares safe backend capability metadata. The backend's internal binding selects its adapter; that binding is not public. Capability metadata never selects a frontend route, lifecycle, transport, or panel.

The frontend uses an explicit workflow-ID-to-panel registry to select UI implementation. Surface profiles may select a subset of workflow IDs and narrow visibility/capability only; they never select a panel or transport. Static fallback after discovery failure must fail closed: it must not weaken member access or widen source capability.

`agreement-review` is an explicitly approved public, one-shot endpoint with a distinct lifecycle and fixed pseudonymisation. It uses an own-frame panel and does not enter the job or session lifecycle; its panel requires the matching backend capability before mounting.

A surface cannot add or widen source capabilities.

### 2. Surfaces own enablement and narrowing only

A surface profile may expose an ordered subset of catalog workflow IDs and may narrow catalog capabilities. Omitted restrictions inherit the catalog capability. Effective capabilities are the intersection of catalog capability and surface restriction.

Surface profiles may override presentation copy only: label, action, description, options, guide, and approved surface-specific samples. They may not override `id`, `uploadId`, input modes beyond the capability ceiling, source cardinality, accepted file types, authentication, lifecycle, transport, or submission behaviour.

An explicitly empty effective capability fails closed. It must not fall back to `file`. Unknown workflow IDs and disabled workflows are not routable and cannot mount an intake or upload callback; disabled entries may stay visible in a sidebar as presentation policy, per ADR 0001. Surface enablement is presentation/product policy, not authorization.

### 3. Shared intake primitives have a bounded scope

Extract reusable intake pieces from the existing single-source path for workflows that share its contract, including file selection/drop, text or mode selection where declared, human verification, status, error, and cancellation handling. The primitives must receive resolved, valid workflow configuration; they must not invent capabilities or authorization policy.

`transaction-intake` and compatible single-source job workflows may use the shared path. `docalias` may share upload/intake mechanics while retaining its result/report actions.

HR Hiring and HR Onboarding retain bespoke lifecycle panels. HR Hiring uses member authentication and its staged `/hr/v1` session lifecycle, with exactly one PDF upload or pasted text; it has no Turnstile or anonymous path. HR Onboarding's multi-file flow must not be forced through the current single-file `FileIntake`.

## Invariants

- Every surface workflow ID exists in the catalog exactly once.
- Every exposed workflow is enabled, non-disabled, has a valid panel binding, and has non-empty effective capabilities.
- Effective capabilities are a subset of catalog capabilities.
- Surface configuration cannot change backend identity or protocol behaviour.
- Surface samples do not mutate or leak into the catalog or another surface.
- Unknown or disabled workflow IDs are not routable and cannot mount an intake or upload callback; sidebar visibility of disabled entries is presentation policy.
- Existing auth, Turnstile, per-backend limits, cancellation guards, deep links, read-once artifacts, and HR lifecycle contracts remain unchanged.

## Consequences

**Good**

- Capability and protocol identity have one owner.
- Surface profiles remain small, auditable presentation/configuration records.
- Empty or incompatible configuration fails closed instead of silently changing behaviour.
- Shared intake fixes benefit compatible workflows without flattening distinct HR state machines.

**Costs**

- The resolver must explicitly intersect and validate configuration rather than shallow-spread overrides.
- HR Hiring and Onboarding retain custom intake controls until their contracts can be represented safely.
- Surface-specific copy and samples require explicit review because they are presentation policy, not workflow capability.

## Scope and non-goals

This ADR covers frontend catalog/surface ownership, resolution, and intake primitive boundaries. It does not change backend APIs, authorization, Turnstile policy, HR session contracts, or the named `docalias` backend rollout. It does not require migrating HR panels to the shared intake path.

## Migration and verification

1. Restrict surface overrides to copy and explicitly supported narrowing fields.
2. Implement one resolver used by navigation, routing, panels, and intake configuration.
3. Convert resolver invariant gates to passing tests: disabled workflows are unroutable; surface modes cannot widen catalog modes; backend identity cannot be overridden; empty intersections remain empty.
4. Extract only the compatible single-source intake primitives and leave HR-specific controls in their current panels.
5. Run `npm test`, `npm run build`, and focused route/lifecycle checks. Preserve the existing read-once, cancellation, auth, and Turnstile characterization coverage.

Rollback is a revert of the resolver and primitive-extraction commits; backend contracts and compatibility routes remain unchanged.
