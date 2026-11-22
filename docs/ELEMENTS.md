# LawyerLab UI elements

**Status:** Active. Defines every UI element: what it contains, what it does, and the rules that govern it. Grounded in what is actually installed (`src/components/`, `src/styles/tokens.css`, `src/index.css`). Design tokens live in `docs/DESIGN.md`; naming and copy rules live in `docs/BRANDING.md`.

---

## Installed stack

| Layer | What's there |
|---|---|
| Fonts | `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `@fontsource-variable/newsreader` — in `package.json`; wire import into `src/main.tsx` or `src/index.css` if not yet done |
| Styling | Plain CSS (`src/index.css` + `src/styles/tokens.css`) + Tailwind v4 (used in CVA components) |
| Utilities | `cva`, `clsx`, `tailwind-merge` |
| Icons | `lucide-react` |
| Router | `react-router-dom` v7 |
| Radix primitives | `@radix-ui/react-alert-dialog`, `@radix-ui/react-dialog`, `@radix-ui/react-label`, `@radix-ui/react-separator`, `@radix-ui/react-slot`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip` |
| UI components | see Component inventory below |
| Page components | `FileIntake`, `JobStatus`, `Shell` |

**Key notes:**
- `Button` uses `@radix-ui/react-slot` (`asChild` prop available). Variants: `primary` · `secondary` · `ghost`. CVA + Tailwind.
- `Tabs` is now Radix-backed (`@radix-ui/react-tabs`), not hand-rolled. Classes: `ll-tabs`, `ll-tablist`, `ll-tab`, `ll-tab-panel`.
- `AlertDialog` is now Radix-backed (`@radix-ui/react-alert-dialog`), not native `<dialog>`.
- `Sheet` wraps `@radix-ui/react-dialog` — slide-in panel. Available for mobile nav.
- `Badge` uses `ll-badge` / `ll-badge-secondary` / `ll-badge-outline` CSS classes.
- `Card` uses `ll-card` / `ll-card-header` / `ll-card-title` / `ll-card-description` / `ll-card-content` / `ll-card-footer` CSS classes.
- `Input` uses `ll-input` CSS class.
- `Separator` wraps Radix separator. `Label` wraps Radix label.
- `Tooltip` wraps `@radix-ui/react-tooltip`.

---

## Global: Header / site nav

**To build** as a shared `<Header>` component. Currently duplicated between `App.tsx` and `Shell.tsx` (header markup is inline in each).

### Structure

```
[ Brand mark + LawyerLab ]    About   Playground   Resources    [ Log in ]
```

| Zone | Slot | Content |
|---|---|---|
| Left | Brand | Mark + wordmark — links to `/` |
| Centre | Nav links | `About` · `Playground` · `Resources` |
| Right | Actions | `Log in` (secondary/ghost) |

### Brand

- Mark: navy square 34×34px, `border-radius: 9px`, `background: var(--ll-primary)`, Lucide `FileCheck2` icon 19px white. Temporary; custom mark deferred.
- Wordmark: `LawyerLab` — 17px, weight 750, `--ll-ink`, `letter-spacing: -.02em`.
- No sub-label or tagline in the header.

### Nav links

The public landing page is `/`. `/mvp/` is the standalone guest Alias; it is not the shared Playground route.

| Label | Route | Notes |
|---|---|---|
| `About` | `/about/` | Deferred — do not add link until page exists |
| `Playground` | `/playground/?workflow=<id>` | Shared workflow UI. Missing workflow selects guest-accessible `alias-doc`; `alias-doc` results use `/playground/jobs/:jobId`; legacy `prepare-doc` links resolve to `alias-doc` (compatibility only). |
| `Resources` | TBD | Deferred — blog, workflow notes, or Lawtrepreneur links |

**Rule:** do not render nav links for pages that don't exist. During MVP: nav zone is empty or omitted; only actions render right.

### Header actions

| Auth state | `Log in` |
|---|---|
| Guest | Visible — ghost/secondary style |
| Auth (session) | Hidden — replace with `My account` or nothing |

- `Log in`: secondary button variant. Links to login flow when auth account creation is scoped (MODEL.md). Do not build the login flow until the auth trigger is decided.
- The header's disabled `Join the waitlist` action is present in code; it is non-functional until a collection endpoint exists.

### Shared spec

- Height: `72px` desktop, `62px` mobile.
- Width: `min(1120px, calc(100% - 40px))` — same constraint as all content columns.
- Bottom border: `1px solid var(--ll-hairline)` (`#e2ddd1`).
- Mobile (`≤640px`): nav links hidden; action labels collapse to icon-only or stack.
- The current `.header-note` ("Document preparation" + lock icon in `App.tsx`) is removed when this component ships.

---

## Global: Footer

Single line, full-width at content column. Present on every page.

```
LawyerLab is a Lawtrepreneur product.        Automated detection is best-effort. Review outputs before use in your practice.
```

| Slot | Content | Style |
|---|---|---|
| Left | `LawyerLab is a Lawtrepreneur product.` | `font-weight: 700`, `color: #394653` |
| Right | Tool-specific review statement | `--ll-muted`, normal weight |

**Right slot copy by page context:**

| Context | Copy |
|---|---|
| Any page with a processing tool | `Automated detection is best-effort. Review outputs before use in your practice.` |
| Pages without a tool (landing, about, 404) | `LawyerLab supports professional judgment; it does not replace it.` |

**Spec:**
- Top border: `1px solid var(--ll-hairline)`.
- Padding: `22px 0 30px`.
- Mobile: `flex-direction: column`, `gap: 7px`, left-aligned.

---

## Page sections

Each section follows the anatomy from `docs/DESIGN.md`:

```
[eyebrow]   — uppercase, tracked, --ll-ink-3 (or --ll-accent for trust moments)
[heading]   — Georgia serif, --ll-ink
[body]      — one short paragraph or structured list
[chip row]  — optional; verified facts only per TRUST-CLAIMS.md
```

One numbered sequence (`01 / 02 / 03`) per page maximum. The standalone Alias at `/mvp/` owns `01 Upload / 02 Prepare / 03 Review`. See BRANDING.md §Section numbering rule.

---

## Landing page (`/`) — built

First-time visitor. Includes inline FileIntake. Earns trust before asking for a document.

### Hero

```
[eyebrow]   Practical AI workflows for lawyers                    (ShieldCheck icon + text)
[h1]        Explore how AI fits into your practice, one workflow at a time.
[lede]      LawyerLab helps you examine the workflow, the risks,
            and the path to implementation.
[CTA row]   [ Alias my document → ]  [ Open playground ]
```

| Element | Spec |
|---|---|
| Eyebrow | `.eyebrow` class, `ShieldCheck` 16px, `--ll-accent` colour |
| h1 | Georgia, `--ll-step-6`, `--ll-ink`, `text-wrap: balance`, max-width 690px |
| Lede | `--ll-step-3` (17px), `--ll-muted`, `line-height: 1.65`, max-width 650px |
| Primary CTA | `Alias my document →` — primary `Button` → `#document-alias` (in-page anchor to the inline Alias box on the same page). Not a route to `/mvp/` |
| Secondary CTA | `Open playground` — secondary `Button` → `/playground/` |

No waitlist CTA in the hero. The Alias box (`#document-alias`) follows the hero and holds the inline `FileIntake`, description, privacy line, and review warning. The disabled waitlist lives later on the page, not in the hero.

No trust copy in hero. Trust moves to the handling evidence section below.

### Handling evidence section

```
[eyebrow]   WHAT THIS TOOL DOES
[h2]        How all uploads are handled

[card 1]                    [card 2]                    [card 3]
TimerReset icon             ServerCog icon              FileSearch icon
Source deleted              Output is temporary         Review before use
after processing
Your uploaded file is       Prepared document and       Every result includes
removed whether the         report are available        a report of what was
job succeeds or fails.      briefly, then removed.      found. You review it.

[SOURCE DELETED]            [OUTPUT · TEMPORARY]        [REPORT INCLUDED]
[PDF · DOCX]                [AUTO-PURGED]               [BEST-EFFORT]
                                                        [REVIEW REQUIRED]
```

- Grid: 3 columns ≥720px, 1 column below.
- Chips: `.chip-row` / `.chip` per `docs/DESIGN.md`. Mono, uppercase, 4px radius, `--ll-surface-2` bg.
- **Chip content is bounded by `docs/TRUST-CLAIMS.md`.** Every chip must have an approved entry there.

### Waitlist section

```
[eyebrow]   WHAT'S NEXT
[h2]        More LawyerLab tools are on the way.
[body]      Join the waitlist for early access, practical workflow
            examples, risk notes, and launch updates.

[ Join the waitlist — coming soon ]   (disabled)
```

- Button: secondary variant, `disabled`, label `Join the waitlist — coming soon`.
- No email input until a collection endpoint exists. The disabled button signals intent without false collection.
- When endpoint ships: replace button with inline email input + submit, or redirect to form page.

---

## Alias (`/mvp/`) — standalone guest workflow

Current `App.tsx`. Separate from the shared workflow UI at `/playground/?workflow=<id>`; guest-accessible standalone exception.

### Intro section

Present until the landing page ships and this page goes workspace-first.

```
[eyebrow]   LawyerLab tool                                (ShieldCheck icon)
[h1]        Explore how to integrate AI into your practice—
            before you build around it.
[lede]      LawyerLab helps you examine the workflow, the risks,
            and the path to implementation.
[details]   Prepare a document for AI by creating a structured working copy
            and identifying personal information before you use the output.
[trust]     Source files are deleted after processing. Outputs are temporary
            and ready for your review.
```

**Rule:** once the landing page (`/`) ships with its own hero, remove this intro from `/mvp/`. The tool page becomes workspace-first — straight to the upload card.

### Steps row (current `.assurances`)

```
01  Upload      PDF or DOCX, one document at a time.
02  Prepare     Personal information is identified and replaced.
03  Review      Check the working copy and report before use.
```

- One numbered sequence per page — this is the current page's allocation.
- Removed when the page goes workspace-first and the landing page carries this content.

### Workspace card

```
┌─────────────────────────────────────────────────────┐
│  Document preparation                  PDF · DOCX   │
│  Prepare a document for AI                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [         drop a file here        ]                │
│  [     or click to select PDF/DOCX ]                │
│                                                     │
│  Human verification  [Turnstile widget]             │
│                                                     │
│  [ Alias Document ]                               │
│  Automated detection is best-effort. Review the     │
│  output before use in your practice.                │
└─────────────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Card border | `1px solid #d6c8a8` (warm `--ll-border`) |
| Card radius | `16px` |
| Card shadow | `0 22px 55px rgba(27,45,37,.08), 0 2px 6px rgba(27,45,37,.04)` |
| Section label | `.step-label` — 11px, weight 800, `#526b82`, uppercase, `letter-spacing: .1em` |
| h2 | Georgia, `--ll-step-5`, `--ll-ink` |
| File type badge | `PDF · DOCX` — `.file-types`, 12px, navy, `border: 1px solid #d6c8a8` |
| Dropzone min-height | `220px` |
| Submit button | Primary `Button`. Idle: `Alias Document`. Busy: `Preparing document…` |
| Review note | 14px, `--ll-muted`, below button |

### Retention note (job in progress)

```
🔒  Temporary by design.   Output is removed after [time] or when downloaded.
```

- Visible only once a job exists (`selectedJob` is set).
- Expiry time from `job.expires_at` — never a hardcoded string.
- Timestamp formatted with `tnum` + `--ll-font-mono` per `docs/DESIGN.md`.

### Handling cards (no active job)

Same three-card structure as landing page. Hidden once a job is selected.

---

## Result workspace (`/playground/jobs/:jobId`)

Current `JobPlayground.tsx`. Shared result route for `alias-doc` (legacy `prepare-doc` jobs resolve here too; compatibility only).

### Tab bar

| Current internal label | Public label | Visible by default |
|---|---|---|
| `blocks` | `Document` | ✅ |
| `markdown` | `Markdown` | ✅ |
| `json` | `JSON` | ❌ — hidden from `TabList`; dev access via `?tab=json` or `?dev=1` |
| `report` | `Redaction report` | ✅ |

Component: existing `Tabs` / `TabList` / `Tab` / `TabPanel` from `src/components/ui/tabs.tsx`. No new tab component needed.

### Result header

```
PREPARING DOCUMENT  ·or·  REDACTION REPORT
Your document
                                    [ expires HH:MM · N pages ]

[ Document ]  [ Markdown ]  [ Redaction report ]
```

| Element | Spec |
|---|---|
| Step label | `.step-label` — `PREPARING DOCUMENT` (in-progress) / `REDACTION REPORT` (done) |
| Expiry readout | `font-family: var(--ll-font-mono)`, `font-feature-settings: var(--ll-tnum)`, `--ll-ink-3`, format `expires HH:MM` from `expires_at` |
| Page count | `N pages` — only when the API supplies an exact processed page count. The current v1 `Job`/`Report` contract does not; omit the readout rather than treating `max_pages` as the actual count. |

### Redaction report tab

Review statement at top of tab (not in header, not in footer):
> `Review outputs before use in your practice.`

Report body:
```
N items found

People                    3
Email addresses            1
Phone numbers              0
...

[Low-confidence items]    (if any spans below threshold)
```

Entity labels use `entityLabels` map already in `JobStatus.tsx` — Canadian-specific labels intact.

### Download button label

`Download working copy` — not "Download Markdown." Existing download logic unchanged.

### Delete confirmation dialog

Uses existing `AlertDialog` component. Copy:

- **Title:** `Delete this output?`
- **Description:** `The prepared document and report will be removed immediately. This cannot be undone.`
- **Cancel:** `Keep it` (default cancel label in component)
- **Confirm:** `Delete output`

---

## Playground workflow page (`/playground/`) — shared chrome

One shared page (`WorkflowPage`) renders every workflow. It is a two-column shell: a header that identifies the workflow, a left column that owns all user action and dynamic execution state, and a right contextual panel that stays static across the workflow's lifecycle.

```text
[ eyebrow ]  [ workflow label (h1) ]
[ surface disclaimer — "Private processing. Files deleted on a clear schedule. Outputs you can review." ]

[ upload-column (7fr) ]        [ upload-aside (5fr) ]
┌ action column ───────────┐   └ contextual panel ─────────────┘
│ input (FileIntake)        │     workflow title (h2)            │
│ selected-file / readiness │     description                    │
│ verification              │     Guide / Options tabs           │
│ submit                    │       Guide — first, default       │
│ progress                  │       Options — only when the      │
│ errors                    │       workflow defines user-       │
│                           │       changeable options; omitted  │
│                           │       when the array is empty      │
│                           │     tier notice                    │
└───────────────────────────┘
```

### Structure

| Zone | Class | Owns |
|---|---|---|
| Header | `.playground-heading` | eyebrow (`surface.copy.workflowEyebrow`, constant **YOUR AI WORKFLOW**) + `<h1>` = `workflow.label` |
| Disclaimer | `.surface-disclaimer` | `surface.copy.disclaimer` — appears once, below the header |
| Action column | `.upload-layout` / `.upload-column` (7fr) | input, selected-file/readiness, verification, submit, progress, errors (the `children`) |
| Contextual panel | `.upload-aside` (5fr) | title, description, Guide/Options tabs, tier notice |

### Rules

- **Header identifies the workflow.** The eyebrow is a constant; the `<h1>` is `workflow.label`. The workflow description appears once, in the contextual panel only — never repeated in the header or the action column.
- **Left column owns action and execution state.** Input, selected-file/readiness, verification, submit, progress, and errors all live in `upload-column`. This is the only part of the page that changes as the user works.
- **Right panel order is fixed.** Title (`.upload-aside-title`, `--ll-ink`), description (`.upload-aside-description`, `--ll-ink-2`), then Guide/Options tabs (`.handling-tabs`), then the tier notice (`.tier-notice`, `--ll-info-surface`, shown only for guest users with limits).
- **Guide is first and default.** Tab list `["guide", "options"]`; `panel` defaults to `"guide"`.
- **Options is conditional.** Renders only when the workflow defines user-changeable options (`workflow.options.length > 0`); omitted when the array is empty. Options use plain-language outcome labels, not processor terminology.
- **Dynamic execution state stays left.** Switching workflows or advancing a job never reorders the layout; the aside is static.
- **Mobile.** At `≤850px` `.upload-layout` collapses to a single column in DOM order (`.upload-column` first), so the action column precedes the contextual panel.

---

## 404 page (`*`)

Current `NotFound()` in `main.tsx` references "MVP" and "playground." Replace:

```
This page doesn't exist.
Return to LawyerLab →        (links to /)
```

- No eyebrow, no heading markup — plain body text + link.
- Uses existing `Shell` wrapper (no sidebar).
- Two-line fix in `main.tsx`.

---

## Not yet built — gated elements

| Element | What unblocks it |
|---|---|
| Shared `<Header>` component | Header markup remains duplicated in `App.tsx` and `Shell.tsx` |
| Nav links (About / Tools / Resources) | Each destination page exists |
| `Log in` → login flow | Auth trigger decision (MODEL.md §What triggers the auth tier) |
| `Join waitlist` → live form | Form provider chosen |
| `Chip` / `ChipRow` components | DESIGN.md chip CSS added to `index.css` |
| `--ll-ink-2/3/4`, `--ll-surface-2` tokens | DESIGN.md token additions to `tokens.css` |
| Account indicator (auth) | Login flow shipped |
| Waitlist confirmation page (`/waitlist/confirmed/`) | Form provider chosen |
| Platform / about page (`/about/`) | Second workflow scoped |
| Per-job cost display | Billing surface approved (MODEL.md) |

---

## Component inventory

| Component | File | Variants / notes | Status |
|---|---|---|---|
| `Button` | `ui/button.tsx` | `primary` (default) · `secondary` · `ghost`; `asChild` via Radix Slot | ✅ live |
| `Alert` | `ui/alert.tsx` | `default` · `destructive` variants | ✅ live |
| `AlertDialog` | `ui/alert-dialog.tsx` | Radix-backed; composable subcomponents | ✅ live |
| `Badge` | `ui/badge.tsx` | `default` · `secondary` · `outline` — `ll-badge` CSS classes | ✅ live |
| `Card` + subcomponents | `ui/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` — `ll-card` CSS classes | ✅ live |
| `Input` | `ui/input.tsx` | `ll-input` CSS class | ✅ live |
| `Label` | `ui/label.tsx` | Radix-backed | ✅ live |
| `Progress` | `ui/progress.tsx` | — | ✅ live |
| `Separator` | `ui/separator.tsx` | Radix-backed; `horizontal` · `vertical` | ✅ live |
| `Sheet` | `ui/sheet.tsx` | Radix Dialog; slide-in panel — use for mobile nav | ✅ live |
| `Tabs` + subcomponents | `ui/tabs.tsx` | Radix-backed; `TabsList`, `TabsTrigger`, `TabsContent` | ✅ live |
| `Tooltip` | `ui/tooltip.tsx` | Radix-backed | ✅ live |
| `FileIntake` | `FileIntake.tsx` | `busy, onSubmit(file, token)` | ✅ live |
| `JobStatus` | `JobStatus.tsx` | `job, onCancel, onRetry, onDone` | ✅ live |
| `Shell` | `Shell.tsx` | `children, headerNote?, sidebar?` — internal routes only | ⚠️ internal |
| `Header` | — | Brand + nav links + actions | 🔲 to build |
| `Chip` / `ChipRow` | — | Approved content per TRUST-CLAIMS.md; use `Badge` as base | 🔲 to build |
