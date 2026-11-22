# LawyerLab brand guide

**Status:** Active. This is the source of truth for customer-facing LawyerLab naming, positioning, voice, and product language.

## Brand

- **Name:** LawyerLab
- **Domain:** `lawyerlab.ca`
- **Commercial owner:** Lawtrepreneur
- **Endorsement:** `LawyerLab is a Lawtrepreneur product.` Use in the footer and conversion contexts; do not crowd the primary header.

LawyerLab has its own useful public product name. It is not a separate contracting, invoicing, privacy-policy, or customer-relationship entity.

## Positioning

> **Explore how to integrate AI into your practice—before you build around it.**
>
> LawyerLab helps you examine the workflow, the risks, and the path to implementation.

### Short descriptor

Practical AI workflow exploration for lawyers.

### Audience

Primary audience: sole practitioners and small law firms. The brand serves lawyers deciding whether and how AI belongs in their existing legal work.

### Product role

LawyerLab helps lawyers identify potential, try bounded workflows, understand risks and limits, and decide what implementation would require.

Lawtrepreneur owns paid strategy and implementation work. LawyerLab must not promise a generic implementation kit or imply that it independently contracts for paid work.

## Customer journey

```text
Explore workflow → understand risks and limits → decide whether it fits →
join waitlist / engage Lawtrepreneur when implementation support is appropriate
```

### Waitlist value

Lead with:

- Early access to new LawyerLab tools.
- Practical workflow examples, risk notes, and launch updates.

Do not lead with paid implementation support before users have developed trust in the tools.

## Trust language

Lead with specific controls, not unsupported "safe AI" claims.

**Preferred trust line:**

> Private processing. Files deleted on a clear schedule. Outputs you can review.

Use precise, substantiated controls elsewhere: private processing, defined deletion schedule, reviewable outputs, and bounded workflows.

### Professional judgment language

Use all three statements in their proper context:

| Context | Copy |
|---|---|
| Brand / How it works | `LawyerLab supports professional judgment; it does not replace it.` |
| Beside output | `Review outputs before use in your practice.` |
| Tool guidance / terms | `You remain responsible for reviewing all output.` |

## Voice

Grade 9 reading level. Practical colleague with clinical authority.

- Clear, calm, measured, and direct.
- Practical outcome before technical method.
- Specific controls instead of broad assurances.
- Opportunity first; risks and safeguards immediately follow.
- No hype, urgency, jargon, or "transform your practice" claims.
- Avoid developer language unless the user has already chosen a technical view.

Prefer `files deleted on a clear schedule` over `defined retention`; `outputs you can review` over `reviewable output`.

## Product language

### Product architecture and naming

LawyerLab borrows the useful **catalogue → chosen workflow → workspace** pattern from Datalab's public playground. It does not borrow Datalab's developer-facing processor language.

```text
LawyerLab                  public product and trust umbrella
├── `/`                    public landing page
├── `/mvp/`                standalone guest Alias
└── `/playground/?workflow=<id>`
                            shared workflow UI; `alias-doc` is guest-accessible

Parse                      internal name for the current processing MVP
Playground                 public nav label for shared workflow UI
```

`Parse` must not appear in customer-facing copy. `Playground` is the **public nav label** for shared workflow UI. In nav context, `Playground` is intentional — it signals exploration and experimentation to a practitioner audience. Do not use it as a button label inside a tool, or as a heading on a tool page. The customer model is a lawyer choosing a **workflow**, not a developer choosing a **processor**.

The shared workflow UI is `/playground/?workflow=<id>`; a missing workflow selects guest-accessible `alias-doc` (Alias). The `alias-doc` result route is `/playground/jobs/:jobId`; `transaction-intake` renders its artifact inline at `/playground/?workflow=transaction-intake`. `/mvp/` remains standalone guest Alias.

> `prepare-doc` is a legacy-compatible link only: `?workflow=prepare-doc` and legacy job metadata resolve to `alias-doc`. Not a canonical ID.

Start with outcomes. Reveal technical settings only when necessary, translated into plain language.

On a selected workflow page, show the workflow description once in the contextual panel beside the action column. The Guide explains what happens and what the user must review; it does not repeat broader product orientation. Options describe only user-changeable behaviour and use plain-language outcome labels rather than processor terminology.

### Current tool

**Name:** Prepare a document for AI

**Descriptor:** Create a structured working copy while identifying and removing personal information. Know what was changed before you use the output.

Do not market this tool simply as `Redact`: it creates a transformed derivative, not necessarily a court-ready or disclosure-ready redacted original. Use `redaction` only in explanatory copy and output labels where technically accurate.

### Labels to use

| Use | Avoid |
|---|---|
| `Playground` (nav label) | `Playground` as a button label inside a tool or as a tool-page heading |
| `Prepare a document for AI` | `Parse` |
| `Choose a workflow` | `Choose a processor` |
| `Alias Document` | `Parse document` |
| `Document options` | `Configuration` |
| `Review output` | `Results` |
| `Guest limits` | `Public limits for conversion` |
| `Document workspace` (if a broader area needs a name) | `Processor` |
| `Structured working copy` | `AI-ready Markdown` in practitioner-facing copy |

### Tool naming rule

Name tools for legal outcomes, then describe the technical process. Do not expose processor-style categories as the primary user model.

### What not to copy from Datalab

- Do not call client-document work a `Playground`.
- Do not use developer terms such as `processor`, `parse`, `BBoxes`, or `block types` as first-level labels.
- Do not show empty future tool cards. One working tool is stronger than a catalogue of promises.
- Do not introduce legal-document examples until they use approved synthetic fixtures and explain the workflow context.

## Visual direction

- Existing `--ll-*` palette remains an interim basis, seeded from `tool-parse` but independently named.
- No `--lx-*` tokens or LegalX / Tool Parse customer-facing copy.
- Custom mark is deliberately out of scope. Keep the current temporary Lucide mark until separately designed.
- Design tokens, page structure, section numbering, and chip patterns live in `docs/DESIGN.md`. Refer there for layout decisions.

### Section numbering rule

A page may contain **one numbered sequence**. Sequences restart at `01` and are never shared across two distinct structural blocks on the same page. Before adding a numbered list, confirm no other numbered block already exists on that page.

The current MVP has one sequence: `01 Upload / 02 Prepare / 03 Review` in the assurances row.

If the three-beat platform section (`Examine. Prepare. Decide.`) is added later, the assurances row's inline numbering must be removed or converted to icons/bullets before launch.

## Deferred decisions

- Primary navigation.
- Post-tool completion CTA.
- Custom mark.
- Full public information architecture.
- Three-beat platform section (`Examine. Prepare. Decide.`) — holds until a second workflow has real scope.
