# Product vocabulary

**Status:** Working terminology. Names the shared surfaces and the identity split that governs LawyerLab UI today. Not a rename mandate — see Naming rules.

---

## Surfaces

**Shell** — shared product chrome for playground routes: brand, navigation, account entry, Trust Centre, and responsive sidebar/sheet. It does not wrap every route. Its `.playground-body` `<main>` owns container context for its content.

**WorkflowShell** — current composition wrapper for job panels only. It combines `WorkflowPage` with `JobWorkflowPanel`; it is not the workflow-type dispatcher and does not imply lifecycle neutrality.

**WorkflowPage** — shared visual/accessibility frame: heading, notice, content rail, handling context. Used by job workflow panels and own-frame workflow pages.

**Lifecycle panels** — workflow-specific owners of submission, processing, cleanup, and results for their backend lifecycle. Shared presentation does not make these lifecycles interchangeable.

**IntakeSurface** — pre-processing source-collection area. Contains a Heading, an IntakePanel, and a HandlingPanel.

- **IntakePanel** — source input. May contain an UploadPanel, a PastePanel (when applicable), a SamplePanel (when applicable), and the PrimaryAction.
- **HandlingPanel** — post-input guidance and controls. Contains a Guide and Options.

**IntakeSurface** is a public, no-sign-in entry (DocAliaser and, when enabled, agreement analysis).

**ReviewWorkspace** — shared completed source/output presentation. At container widths of at least 821px (the `.playground-body` container), source and output display side-by-side; below that, they stack. Presentation only: workflow-specific panels retain result acquisition and lifecycle ownership. `contract-review` is a fixed-artifact exception and does not use `ReviewWorkspace`.

---

## Identity split

**Public and signed-in workflow states** — conceptual contexts in the playground, not separate component environments. Identity gates protected workflows; `Shell` owns playground chrome, while each workflow entry owns its workflow UI and lifecycle.

**DocAliaser** spans contexts. Classify it by the user's capability/state, not by workflow ID.

---

## Component / state diagram

```text
Playground route
└── Shell (playground chrome; .playground-body owns container context)
    └── Playground explicit workflow registry
        ├── identity/catalog gates active workflow
        ├── job entry
        │   └── WorkflowShell
        │       ├── WorkflowPage
        │       └── JobWorkflowPanel
        └── own-frame entry
            └── Workflow page owns lifecycle and result UI
                └── ReviewWorkspace (where used)
                    ├── source
                    └── output

Other routes may render outside Shell.
```

The explicit registry distinguishes job panels from own-frame pages. The runtime catalog determines whether a workflow is listed and whether its result is supported; identity gates protected workflows. Own-frame lifecycle panels own their result UI. `ReviewWorkspace` shares only completed source/output presentation. `contract-review` uses a fixed artifact result.

---

## Code map

Where each term lives today. Terms are conceptual; the code keeps its own names (see Naming rules). Template and reuse rules: `docs/adr/0006-workflow-template.md` ("Shared building blocks").

| Term | Code |
|---|---|
| Shell | `src/components/Shell.tsx` — playground chrome; `.playground-body` `<main>` provides container context |
| WorkflowShell | `src/components/WorkflowShell.tsx` — wraps job panels with `WorkflowPage` and `JobWorkflowPanel`; no dispatch |
| WorkflowPage | `src/components/WorkflowPage.tsx` — shared visual/accessibility frame |
| Playground dispatch and catalog/identity gates | `src/pages/Playground.tsx`; explicit entries in `src/lib/workflowPanels.ts` (`job` vs `own-frame`) |
| Lifecycle panels | `src/lib/workflowPanels.ts` maps job panels and own-frame pages; each entry owns its workflow lifecycle |
| IntakeSurface / ProtectedIntakeSurface | No separate shared component under these names; intake UI is owned by workflow pages/panels, including `FileIntake` for job workflows |
| IntakePanel | `src/components/FileIntake.tsx` |
| UploadPanel | `FileDropzone` (`src/components/intake/FileDropzone.tsx`), via `SingleFileIntake` |
| PastePanel | `TextIntake` (`src/components/intake/TextIntake.tsx`), via `SourceIntake` |
| SamplePanel | `samples` in `SingleFileIntake`, from the catalog |
| PrimaryAction | Submit button in `FileIntake`, labelled by `workflow.action` |
| HandlingPanel / Guide / Options | `src/components/HandlingPanel.tsx`; Options shows picker only for `selectable` handling |
| ProcessingSurface | Job status in `src/components/JobWorkflowPanel.tsx`, driven by `src/lib/useWorkflowJob.ts` |
| ResultSurface | Job result panel registered in `src/lib/workflowPanels.ts` and guarded by `accepts`; own-frame panels own their result UI |
| ReviewWorkspace | `src/components/ReviewWorkspace.tsx`; shared source/output presentation used by completed-result pages; container breakpoint in `src/index.css` |
| `contract-review` fixed-artifact exception | `src/lib/workflowPanels.ts` (`result: "artifact"`) and `src/components/ContractReviewPanel.tsx` |
| Job submission | `src/lib/useWorkflowJob.ts` — `/v1/jobs` submit path, sends `workflow_settings` |
| Public agreement analysis | `src/components/AgreementReview.tsx`, with direct transport and strict result validation in `src/lib/api.ts`; it has no job or session lifecycle |
| HumanVerification | Turnstile, single-use token, for public/token-gated paths only |

`MultiFileIntake` is the input-method radio group, not a multi-file uploader. Own-frame pages (including HR Hiring and HR Onboarding) own session lifecycle and result UI; they are not dispatched through `WorkflowShell`.

---

## Naming rules

- Use these names conceptually today. Do not rename existing code solely for terminology.
- Do not extract shared components until real reuse warrants it.
- These are vocabulary, not a refactor plan. Shared components stay separate until the reuse that justifies merging actually exists.
