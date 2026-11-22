import { useEffect, useMemo, useRef, useState } from "react"
import type { OnboardArtifact, OnboardItem, OnboardSourceMeta } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { CopyControl } from "@/components/CopyControl"

type OnboardingResultProps = {
  artifact: OnboardArtifact
  sources: OnboardSourceMeta[]
  onStartOver: () => void
  startOverBusy?: boolean
}

const DEFAULT_CONFIRM_LABEL = "Confirm with employer"
const UNKNOWN_SOURCE = "Source file unavailable"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
const byPosition = (a: OnboardItem, b: OnboardItem) => a.position - b.position

// Model-written title is untrusted: keep the download name to [a-z0-9-].
export function onboardingFilename(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "")
  return `${slug || "onboarding-sequence"}.md`
}

// Untrusted text (model output, filenames, the notice) becomes one escaped Markdown line.
export function escapeMd(value: string) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/[\\`*_[\]()<>#!|]/g, "\\$&").replace(/^[-+=]/, "\\$&").replace(/^(\d+)\./, "$1\\.")
    .replace(/:(?=\/\/)/g, "\\:").replace(/\bwww\./gi, (m) => `${m.slice(0, -1)}\\.`)
}

function toMarkdown(artifact: OnboardArtifact, items: OnboardItem[], sources: OnboardSourceMeta[]) {
  const sourceName = (id: string) => escapeMd(sources.find((s) => s.source_id === id)?.filename ?? UNKNOWN_SOURCE)
  const lines = [`# ${escapeMd(artifact.title)}`, "", escapeMd(artifact.notice), ""]
  for (const item of items) {
    lines.push(`${item.position}. ${escapeMd(item.task)}`)
    lines.push(`   - ${escapeMd(item.owner)}`)
    lines.push(`   - Timing: ${escapeMd(item.timing ?? "Not specified")}`)
    lines.push(`   - Dependencies: ${escapeMd(item.dependencies.length ? item.dependencies.join(", ") : "None")}`)
    lines.push(`   - ${item.provenance.length ? "Source-backed" : "Needs confirmation"}`)
    if (item.confirmation_required) lines.push(`   - ${escapeMd(item.confirmation_label || DEFAULT_CONFIRM_LABEL)}`)
    for (const p of item.provenance) lines.push(`   - Source: ${sourceName(p.source_id)} — “${escapeMd(p.quote)}”`)
    lines.push("")
  }
  if (artifact.missing_information.length) {
    lines.push("## Information to confirm", "")
    for (const m of artifact.missing_information) lines.push(`- ${escapeMd(m.confirmation_label || DEFAULT_CONFIRM_LABEL)}: ${escapeMd(m.detail)}`)
    lines.push("")
  }
  if (artifact.limitations.length) {
    lines.push("## Limitations", "")
    for (const l of artifact.limitations) lines.push(`- ${escapeMd(l)}`)
    lines.push("")
  }
  return lines.join("\n")
}

// Splits model/source text on `<PERSON>`-style labels; odd indexes are the captured labels.
function Redacted({ text }: { text: string }) {
  return <>{text.split(/(<[A-Z][A-Z0-9_]*>)/).map((part, i) => i % 2 ? <span key={i} className="redaction-placeholder">{part}</span> : part)}</>
}

export function OnboardingResult({ artifact, sources, onStartOver, startOverBusy }: OnboardingResultProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [confirmingStartOver, setConfirmingStartOver] = useState(false)
  const items = useMemo(() => [...artifact.items].sort(byPosition), [artifact.items])
  const markdown = useMemo(() => toMarkdown(artifact, items, sources), [artifact, items, sources])

  useEffect(() => { headingRef.current?.focus() }, [])

  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }))
    const link = document.createElement("a")
    link.href = url
    link.download = onboardingFilename(artifact.title)
    link.click()
    URL.revokeObjectURL(url)
  }

  const sourceFilename = (id: string) => sources.find((s) => s.source_id === id)?.filename

  return (
    <section className="onboarding-result" aria-labelledby="onboarding-result-title">
      <p className="result-notice" role="note">{artifact.notice}</p>
      <div className="report-summary">
        <div className="report-summary-heading">
          <div>
            <Badge variant="secondary">Ready to review</Badge>
            <h2 id="onboarding-result-title" ref={headingRef} tabIndex={-1}>{artifact.title}</h2>
          </div>
        </div>
        <p>{plural(items.length, "onboarding item")} prepared from {plural(sources.length, "source file")}.</p>
      </div>

      <ol className="onboarding-items">
        {items.map((item) => {
          const sourced = item.provenance.length > 0
          return (
            <li key={item.id} id={`onboard-item-${item.id}`} className={sourced ? "onboarding-item" : "onboarding-item onboarding-item-confirm"}>
              <h3>{item.position}. <Redacted text={item.task} /></h3>
              <p className="onboarding-item-meta">
                <span><Redacted text={item.owner} /></span>
                <span>Timing: {item.timing === null ? "Not specified" : <Redacted text={item.timing} />}</span>
                <span>Dependencies: {item.dependencies.length ? <Redacted text={item.dependencies.join(", ")} /> : "None"}</span>
              </p>
              <div className="onboarding-item-chips">
                <Badge variant={sourced ? "secondary" : "outline"}>{sourced ? "Source-backed" : "Needs confirmation"}</Badge>
                {item.confirmation_required && <Badge variant="outline">{item.confirmation_label || DEFAULT_CONFIRM_LABEL}</Badge>}
              </div>
              {item.provenance.map((p, i) => {
                const filename = sourceFilename(p.source_id)
                return (
                  <details key={i} className="onboarding-provenance">
                    <summary>View source: {filename ?? UNKNOWN_SOURCE}</summary>
                    <p>Source file: {filename ?? UNKNOWN_SOURCE}</p>
                    <blockquote className="onboarding-quote">“<Redacted text={p.quote} />”</blockquote>
                  </details>
                )
              })}
            </li>
          )
        })}
      </ol>

      {artifact.missing_information.length > 0 && (
        <section>
          <h3>Information to confirm</h3>
          <p>These points were not established by the uploaded sources.</p>
          <ul>
            {artifact.missing_information.map((m, i) => (
              <li key={i}>
                <a href={`#onboard-item-${m.item_id}`}>{m.confirmation_label || DEFAULT_CONFIRM_LABEL}</a> — <Redacted text={m.detail} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {artifact.limitations.length > 0 && (
        <section>
          <h3>Limitations</h3>
          <ul>{artifact.limitations.map((l, i) => <li key={i}><Redacted text={l} /></li>)}</ul>
        </section>
      )}

      <div className="job-result-actions" role="group" aria-label="Checklist actions">
        <Button variant="secondary" onClick={download}>Download checklist</Button>
        <CopyControl content={markdown} label="onboarding checklist" failureMessage="Copy failed. Use Download checklist instead." />
      </div>
      <p className="onboarding-read-once"><strong>Save this checklist now.</strong> This result cannot be fetched again after you leave this result or start over.</p>

      <div>
        <Button variant="secondary" disabled={startOverBusy} onClick={() => setConfirmingStartOver(true)}>Start over</Button>
        <AlertDialog open={confirmingStartOver} onOpenChange={(open) => { if (!startOverBusy) setConfirmingStartOver(open) }}>
          <AlertDialogContent>
            <AlertDialogTitle>Start over?</AlertDialogTitle>
            <AlertDialogDescription>This checklist and its source session will be deleted immediately. Save a copy first if you need it. This cannot be undone.</AlertDialogDescription>
            <div className="job-result-actions">
              <AlertDialogCancel disabled={startOverBusy}>Keep checklist</AlertDialogCancel>
              <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={onStartOver} disabled={startOverBusy}>Delete and start over</AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  )
}
