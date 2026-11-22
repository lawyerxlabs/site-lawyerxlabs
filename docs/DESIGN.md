# LawyerLab design reference

**Status:** Active. Companion to `docs/BRANDING.md`. Covers tokens, page structure, component patterns, and motion. `BRANDING.md` owns naming, voice, and copy rules. `DESIGN.md` owns layout and visual implementation decisions.

---

## Tokens (`src/styles/tokens.css`)

### Ink ramp

Four steps: headings → body → secondary → disabled/meta.

```css
--ll-ink:    #1c2833;   /* headings, primary labels */
--ll-ink-2:  #394653;   /* body text, descriptions */
--ll-ink-3:  #5d6673;   /* secondary text, section eyebrows */
--ll-ink-4:  #9aa0a8;   /* disabled, placeholders, meta readouts */
```

`--ll-muted` maps to `--ll-ink-3` for backward compatibility. Migrate usages to the named step. `LlTokenName` in `src/surfaces/contract.ts` lists allowed surface override tokens; see that union for the complete list.

### Surface ramp

```css
--ll-page:      #f9fafd;   /* page background */
--ll-surface:   #f4f6f8;   /* cards, panels */
--ll-surface-2: #eaedf1;   /* inner panels, nested chips */
--ll-surface-3: #f1f4f7;
```

### Borders and rules

```css
--ll-rule:     #d6c8a8;           /* warm document border */
--ll-hairline: #e2ddd1;           /* structural hairlines */
--ll-border:   var(--ll-rule);    /* back-compat alias */
```

### Accent

```css
--ll-accent:  #0e5a96;   /* focus rings, interactive moments only */
--ll-primary: #1a3a5c;   /* brand fill — buttons, mark */
--ll-primary-pressed: #142e4a;
```

Reserve `--ll-accent` for interactive feedback (focus rings, hover states). Do not spend it on eyebrows or decorative elements.

### Motion

```css
--ll-dur-fast: .12s;
--ll-dur-base: .24s;
--ll-ease:     cubic-bezier(.25, 1, .5, 1);   /* out-quart */
```

All transitions use these values. Pair with `prefers-reduced-motion` guard on any animated element.

## Typography

LawyerLab uses three self-hosted variable families. Vite bundles their WOFF2 assets; the product makes no remote font requests.

```css
--ll-font-sans:  "Geist Variable", "Geist", ui-sans-serif, system-ui, sans-serif;
--ll-font-serif: "Newsreader Variable", "Newsreader", Georgia, serif;
--ll-font-mono:  "Geist Mono Variable", "Geist Mono", ui-monospace, monospace;
```

### Roles

- **Newsreader:** customer-facing orientation only — MVP page title, workflow section headings, and customer result-summary headings. Use optical sizing, weight 500, tight tracking.
- **Geist:** navigation, body copy, controls, labels, alerts, dialogs, reports, and all internal playground headings.
- **Geist Mono:** job IDs, raw JSON, block metadata, and machine-authored identifiers. Normal dates, file sizes, counts, and expiry times remain Geist with tabular numerals.
- Serif heading rules are scoped under `.mvp-shell`; never apply serif typography through global `h1` or `h2` selectors.

### Type scale

```css
--ll-step-0: .8125rem;                                /* 13px — eyebrows, badges, meta */
--ll-step-1: .875rem;                                 /* 14px — supporting copy, labels */
--ll-step-2: 1rem;                                    /* 16px — body */
--ll-step-3: 1.0625rem;                               /* 17px — large body, lede */
--ll-step-4: clamp(1.25rem, 1.1rem + .5vw, 1.5rem); /* component heading */
--ll-step-5: clamp(1.5rem, 1.3rem + .7vw, 1.75rem); /* section heading */
--ll-step-6: clamp(2.25rem, 1.9rem + 1.5vw, 3.25rem); /* customer page title */
```

Line-heights: 1.12–1.2 at display scale, 1.3–1.35 at component-heading scale, 1.5–1.65 for body copy. Reserve 11–12px for compact uppercase markers and machine metadata, never explanatory prose.

### Numeric features

```css
--ll-tnum: "tnum" 1;
```

Apply tabular numerals to file sizes, page counts, expiry times, and span counts without changing them to monospace.

## Component system

LawyerLab uses a shadcn-style owned-source component architecture in `src/components/ui/`. Components are committed source, not runtime wrappers around a theme package.

- **Radix primitives** own keyboard behavior, focus management, portals, dismissal, and ARIA relationships for Tabs, AlertDialog, Tooltip, Sheet, Label, and Separator.
- **CVA** owns visual variants for Button, Alert, and Badge.
- **`--ll-*` tokens** remain brand source of truth. shadcn-compatible semantic variables (`--primary`, `--border`, `--ring`, etc.) are aliases for component interoperability, not a second theme.
- Shared primitive styles live in `src/styles/components.css`. Page composition stays in `src/index.css`.
- Current primitive set: Button, Input, Label, Card, Badge, Separator, Alert, AlertDialog, Tabs, Progress, Tooltip, Sheet.
- Button variants: `primary`, `secondary`, `destructive`, `ghost`. Destructive is reserved for irreversible actions and must appear inside a confirmation flow.
- Do not add unused shadcn catalogue components. Add primitives when a shipped workflow requires them.

---

## Page structure

### Section anatomy

Every section on the main MVP page follows the same anatomy:

```text
[eyebrow]     — uppercase, tracked, --ll-ink-3, mono or sans
[heading]     — Newsreader serif, --ll-ink
[body]        — one short paragraph or structured list
[readout row] — optional chip strip (see below)
```

### Section-numbering rule

A page carries **one numbered sequence** (`01 / 02 / 03 …`). Two sequences on the same page signal structural confusion. Before shipping a numbered block, confirm no other numbered block is live on that page.

Current allocation:
- MVP page: `01 Upload / 02 Prepare / 03 Review` (assurances row)
- Platform section (`Examine. Prepare. Decide.` — deferred): will replace the assurances row numbering when added.

### Section spacing

```css
section + section { margin-top: 40px; }
@media (max-width: 640px) { section + section { margin-top: 32px; } }
```

---

## Playground page composition

`/playground/` is a single shared page (`WorkflowPage`) for every workflow. It is a two-column shell: a header that identifies the workflow, a left column that owns all user action and dynamic execution state, and a right contextual panel that stays static across the workflow's lifecycle.

```text
[ eyebrow ]  [ workflow label (h1) ]
[ one-sentence workflow description ]

[ upload-column (7fr) ]        [ upload-aside (5fr) ]
┌ action column ───────────┐   └ contextual panel ─────────────┘
│ input                     │     workflow title (h2)            │
│ selected-file / readiness │     description                    │
│ verification              │     Guide / Options tabs           │
│ submit                    │       Guide — first, default       │
│ progress                  │       Options — only when the      │
│ errors                    │       workflow defines user-       │
│                           │       changeable options; omitted  │
│                           │       when the array is empty      │
│                           │     review notice and tier notice  │
└───────────────────────────┘
```

- **Header identifies the workflow.** `.playground-heading` holds the eyebrow (`surface.copy.workflowEyebrow`, a constant — always **YOUR AI WORKFLOW**) and the `<h1>` (`workflow.label`). The workflow description appears once immediately beneath the heading, before the intake and contextual panels.
- **Two-column grid.** `.upload-layout` is `grid-template-columns: 7fr 5fr` with `align-items: start`. `.upload-column` (action) and `.upload-aside` (context) carry `min-width: 0` so the column can shrink without clipping the panel.
- **Left column owns action and execution state.** Input, selected-file/readiness, verification, submit, progress, and errors all live in `upload-column` (the `children` prop). This is the only part of the page that changes as the user works.
- **Right panel order is fixed.** Title (`.upload-aside-title`, `--ll-ink`), Guide/Options tabs (`.handling-tabs`), the surface review notice, then the tier notice (`.tier-notice`, `--ll-info-surface`). The tier notice renders only for guest users with limits.
- **Guide is first and default.** The tab list is `["guide", "options"]` and `panel` defaults to `"guide"`.
- **Options is conditional.** `Options` renders only when the workflow defines user-changeable options (`workflow.options.length > 0`); when the array is empty the panel shows Guide alone. Options use plain-language outcome labels, not processor terminology.
- **Dynamic execution state stays left.** Switching workflows or advancing a job never reorders the layout; the aside is static.
- **Mobile.** At `≤850px` `.upload-layout` collapses to a single column in DOM order (`.upload-column` first), so the action column precedes the contextual panel.

---

## Eyebrow

Used as a section label above headings and beside numbered blocks.

```css
.eyebrow {
  display: inline-flex; align-items: center; gap: 7px;
  color: var(--ll-ink-3);
  font-size: var(--ll-step-0);       /* .875rem */
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  margin: 0 0 12px;
}
.eyebrow--accent { color: var(--ll-accent); }   /* verification, trust moments */
```

Eyebrows may carry an icon (`<ShieldCheck size={14} />`) or a section number (`01`). Use one or the other, not both.

---

## Chip readouts

Instrument-style inline metadata. Derived from Datalab's operational-spec pattern. Use only for **verified facts** from `docs/TRUST-CLAIMS.md` or current job state from the API.

```html
<div class="chip-row">
  <span class="chip">SOURCE DELETED</span>
  <span class="chip">OUTPUT · TEMPORARY</span>
  <span class="chip chip--ok">REVIEW REQUIRED</span>
</div>
```

```css
.chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }

.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px;
  border: 1px solid var(--ll-border);
  border-radius: 4px;
  background: var(--ll-surface-2);
  color: var(--ll-ink-3);
  font-family: var(--ll-font-mono, monospace);
  font-size: .72rem;
  font-weight: 500;
  font-feature-settings: var(--ll-tnum);
  letter-spacing: .08em;
  text-transform: uppercase;
  white-space: nowrap;
  line-height: 1;
}

.chip--ok    { color: #33783c; background: #f0fdf4; border-color: #b9f8cf; }
.chip--warn  { color: #7a4900; background: #fefce8; border-color: #fff085; }
.chip--err   { color: #7f312b; background: #fdf7f6; border-color: #e6c7c3; }
```

### Approved chip content

Derived directly from `docs/TRUST-CLAIMS.md`. New chips require a verified claim before shipping.

| Chip text | Source | Approved |
|---|---|---|
| `SOURCE DELETED` | orchestrator.js:146 | ✅ |
| `OUTPUT · TEMPORARY` | orchestrator.js:58–59 | ✅ |
| `REVIEW REQUIRED` | TRUST-CLAIMS.md | ✅ |
| `PDF · DOCX` | contracts/file types | ✅ |
| `BEST-EFFORT` | TRUST-CLAIMS.md | ✅ |
| `15 MIN · GUEST` | orchestrator FREE_RETENTION default | ✅ with caveat: deployment-configurable; display `expires_at` from API instead |
| `REPORT INCLUDED` | ADR-002 §report endpoint | ✅ |
| `PRIVATE PROCESSING` | **not approved** | ❌ pending ops review |

---

## Handling cards

The "What this tool does" section. Three articles in a grid:

```css
.handling-grid { display: grid; gap: 16px; }
@media (min-width: 720px) { .handling-grid { grid-template-columns: repeat(3, 1fr); } }
```

Each article anatomy:
```text
[icon]   [h3]   [paragraph]   [chip-row]
```

Add `.chip-row` to each article when chips ship. Keep chips out of the article until `TRUST-CLAIMS.md` confirms the content.

---

## Workspace card

Single document interaction container. Warm border, strong shadow:

```css
.workspace {
  padding: 0 32px 32px;
  border: 1px solid var(--ll-rule);       /* warm: #d6c8a8 */
  border-radius: 16px;
  box-shadow: 0 22px 55px rgba(27,45,37,.08), 0 2px 6px rgba(27,45,37,.04);
  background: #fff;
}
```

The workspace card is deliberately warmer and more substantial than section cards. It is the primary interaction surface.

---

## Buttons

```css
/* Primary: navy fill — brand actions (upload, prepare) */
.btn-primary {
  background: var(--ll-primary);
  color: white;
  border-radius: 8px;
  min-height: 40px; padding: 9px 18px;
  font-size: .92rem; font-weight: 600;
  transition: background var(--ll-dur-fast) var(--ll-ease);
}
.btn-primary:hover:not(:disabled) { background: var(--ll-primary-pressed); }

/* Secondary: surface fill — waitlist CTA, cancel */
.btn-secondary {
  background: white;
  border: 1px solid var(--ll-border);
  border-radius: 8px;
  color: var(--ll-ink);
  transition: border-color var(--ll-dur-fast) var(--ll-ease);
}
.btn-secondary:hover:not(:disabled) { border-color: var(--ll-ink); }

/* Disabled: always .45 opacity, cursor not-allowed */
:disabled { opacity: .45; cursor: not-allowed; }
```

Border-radius: **8px buttons, 12–16px cards**. Do not use 1px Datalab-style radius — that is developer-instrument voice, not practitioner warmth.

---

## Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
```

Add to `src/index.css`. Required before any animated element ships publicly.

---

## Platform section — Deferred

The three-beat structure (`Examine. Prepare. Decide.`) is designed and blocked pending a second real workflow. Do not ship empty cards or placeholder tools.

When it ships:

```text
[headline]    Examine. Prepare. Decide.
[scope line]  One workflow today. More tools as we learn what practitioners need.

[01] EXAMINE
  Headline verb: practitioner outcome
  2 sentences max.
  Chip row: verified handling facts

[02] PREPARE
  ...

[03] DECIDE
  ...
  Last chip: [ STRATEGY · LAWTREPRENEUR ] (links to Lawtrepreneur engagement)
```

The assurances row (`01 Upload / 02 Prepare / 03 Review`) is replaced by this section when it ships — not added alongside it. See BRANDING.md §Section numbering rule.

---

## Numeric readouts

File sizes, page counts, expiry times, confidence scores, span counts — all use `tnum` + mono:

```css
.readout {
  font-family: var(--ll-font-mono, monospace);
  font-feature-settings: var(--ll-tnum);
  font-size: var(--ll-step-0);
  color: var(--ll-ink-3);
}
```

`JobStatus.tsx` should apply `.readout` to the expiry string and any per-span counts in the report.

---

## Document reference

- `docs/BRANDING.md` — naming, voice, copy rules, positioning, product architecture
- `docs/TRUST-CLAIMS.md` — approved trust language with code-level evidence
- `docs/DESIGN.md` — this file: tokens, structure, patterns
