import { ProcessingState } from "@/components/ProcessingState"
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Download, FilePlus2, Trash2 } from "lucide-react"
import { Shell } from "@/components/Shell"
import { ReviewWorkspace } from "@/components/ReviewWorkspace"
import { CopyControl } from "@/components/CopyControl"
import { Alert } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { ApiError, deleteJob, friendlyError, getJob, getMarkdown, getReport, type Block, type Job, type Report } from "@/lib/api"
import { pollJob } from "@/lib/pollJob"
import { hasRedactionPlaceholder } from "@/lib/blockTransform"
import { entityLabels } from "@/lib/entityLabels"
import { LOW_CONFIDENCE_THRESHOLD, serializePlaygroundBlocks, serializeRedactionReport } from "@/lib/resultCopy"
import { renderMarkdown } from "@/lib/markdown"
import { clearSource, getSource, SOURCE_SESSION_UNAVAILABLE } from "@/lib/sourceStore"
import { useTier } from "@/lib/useTier"
import { getRoutableWorkflow, getWorkflow } from "@/lib/workflows"

type Tab = "blocks" | "markdown" | "report" | "json"

// Result markdown is untrusted output: preserve link text, never activate URLs or load images.

// pdf.js is ~440kB; load it only when the Document tab actually needs a source preview.
const SourcePreview = lazy(() => import("@/components/SourcePreview").then((m) => ({ default: m.SourcePreview })))

// /result/markdown and /result/report are read-once (docs/API-CONTRACT.md: no automatic
// retry). Keep one settled promise per endpoint: partial success survives independently,
// and a failed read cannot be silently repeated on remount.
const markdownCache = new Map<string, Promise<string>>()
const reportCache = new Map<string, Promise<Report>>()
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>()
function loadMarkdown(jobId: string) {
  const cached = markdownCache.get(jobId)
  if (cached) return cached
  const request = getMarkdown(jobId)
  markdownCache.set(jobId, request)
  return request
}
function loadReport(jobId: string) {
  const cached = reportCache.get(jobId)
  if (cached) return cached
  const request = getReport(jobId)
  reportCache.set(jobId, request)
  return request
}
// Purged jobs are observed by the status poll; drop their read-once entries so a
// remount cannot serve output that no longer exists.
function purgeResultsCache(jobId: string) {
  markdownCache.delete(jobId)
  reportCache.delete(jobId)
  const timer = expiryTimers.get(jobId)
  if (timer) clearTimeout(timer)
  expiryTimers.delete(jobId)
}
function scheduleExpiry(jobId: string, expiresAt: string | null, onExpire: () => void) {
  if (!expiresAt) return
  const delay = new Date(expiresAt).getTime() - Date.now()
  if (!Number.isFinite(delay) || delay <= 0) { clearSource(jobId); purgeResultsCache(jobId); onExpire(); return }
  const existing = expiryTimers.get(jobId)
  if (existing) clearTimeout(existing)
  expiryTimers.set(jobId, setTimeout(() => { clearSource(jobId); purgeResultsCache(jobId); onExpire() }, delay))
}


const PUBLIC_TABS: { id: Tab; label: string }[] = [
  { id: "blocks", label: "Blocks" },
  { id: "markdown", label: "Working copy" },
  { id: "report", label: "Report" },
  { id: "json", label: "JSON" },
]

function initialTab(): Tab {
  const requested = new URLSearchParams(window.location.search).get("tab")
  if (requested === "markdown" || requested === "report" || requested === "json") return requested
  return "blocks"
}

function formatExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null
  const when = new Date(expiresAt)
  if (Number.isNaN(when.getTime())) return null
  return when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

// Plain redaction jobs predate workflow metadata and are Alias jobs. Explicit workflow metadata is
// authoritative: guests may only open Alias jobs (or metadata-free jobs) owned by their browser session.
function isGuestDocument(job: Job) {
  return job.workflow === undefined || getWorkflow(job.workflow.id)?.id === "docalias"
}

function guestGateMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 403 && error.code === "forbidden") {
    return "This document belongs to another browser session. Open it in the browser where you prepared it."
  }
  return null
}

export function JobPlayground() {
  const { signedIn, ready, login } = useTier()
  const { jobId = "" } = useParams<{ jobId: string }>()
  const [guestJob, setGuestJob] = useState<Job | null>(null)
  const [gateError, setGateError] = useState<string | null>(null)

  // Query parameters are presentation only. Guests first resolve the owner-authorized job,
  // then may continue only when server metadata identifies the public workflow.
  useEffect(() => {
    if (!ready || signedIn) return
    let stopped = false
    setGuestJob(null)
    setGateError(null)
    getJob(jobId).then((job) => {
      if (!stopped) setGuestJob(job)
    }).catch((error) => {
      if (!stopped) setGateError(guestGateMessage(error) ?? friendlyError(error))
    })
    return () => { stopped = true }
  }, [jobId, ready, signedIn])

  if (!ready) return <Shell><div className="playground-empty" role="status"><p>Checking your session…</p></div></Shell>
  if (!signedIn && (gateError || (guestJob && !isGuestDocument(guestJob)))) return (
    <Shell>
      <div className="playground-empty">
        <h1>Sign in to view this document</h1>
        <p>{gateError ?? "Workspace workflows require sign in."}</p>
        <button type="button" className="ll-button ll-button-primary" onClick={login}>Sign in</button>
      </div>
    </Shell>
  )
  if (!signedIn && guestJob) return <JobWorkspace initialJob={guestJob} />
  if (!signedIn) return null
  return <JobWorkspace initialJob={guestJob} />
}

function JobWorkspace({ initialJob }: { initialJob?: Job | null }) {
  const { jobId = "" } = useParams<{ jobId: string }>()
  const [searchParams] = useSearchParams()
  // Until the job arrives, use the route hint. Loaded job metadata is authoritative.
  const requestedWorkflow = searchParams.get("workflow")
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [job, setJob] = useState<Job | null>(initialJob ?? null)
  const rawWorkflowId = job?.workflow?.id ?? requestedWorkflow ?? "docalias"
  const workflowId = rawWorkflowId // legacy id, same as Playground
  const workflow = getRoutableWorkflow(workflowId)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [markdownError, setMarkdownError] = useState<string | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const currentJobId = useRef(jobId)
  const initialJobRef = useRef(initialJob)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    currentJobId.current = jobId
    headingRef.current?.focus()
  }, [jobId])

  // Poll job status until terminal
  useEffect(() => {
    setJob(initialJobRef.current ?? null); setMarkdown(null); setReport(null); setMarkdownError(null); setReportError(null); setError(null); setSelectedBlockId(null)
    return pollJob(jobId, {
      initialDelay: 0,
      interval: 3000,
      load: () => {
        const initial = initialJobRef.current
        initialJobRef.current = null
        return initial ?? getJob(jobId)
      },
      onJob: (next) => {
        setJob(next)
        if (next.status === "completed") scheduleExpiry(jobId, next.expires_at, () => {
          if (currentJobId.current !== jobId) return
          setMarkdown(null)
          setReport(null)
          setJob((current) => current ? { ...current, status: "purged" } : current)
        })
        if (next.status === "purged") {
          clearSource(jobId)
          purgeResultsCache(jobId)
        }
      },
      onError: (e) => setError(friendlyError(e)),
    })
  }, [jobId])

  const workflowState = job?.workflow?.status
  const completed = job?.status === "completed"
  // Base job completed but workflow still running: result endpoints are read-once, so wait.
  const resultsReadable = job?.job_id === jobId && completed && (workflowState === undefined || workflowState === "completed")

  // Fetch results once readable — via loadMarkdown/loadReport so a remount never
  // re-reads the read-once endpoints (docs/API-CONTRACT.md).
  useEffect(() => {
    if (currentJobId.current !== jobId || !resultsReadable) return
    let stopped = false
    loadMarkdown(jobId)
      .then((m) => { if (!stopped) setMarkdown(m) })
      .catch((e) => { if (!stopped) setMarkdownError(friendlyError(e)) })
    loadReport(jobId)
      .then((r) => { if (!stopped) setReport(r) })
      .catch((e) => { if (!stopped) setReportError(friendlyError(e)) })
    return () => { stopped = true }
  }, [resultsReadable, jobId])

  const html = useMemo(() => (markdown === null ? "" : renderMarkdown(markdown)), [markdown])
  const blocks: Block[] = report?.blocks ?? []
  const expiry = formatExpiry(job?.expires_at ?? null)
  const resultReady = markdown !== null && report !== null
  const downloadMarkdown = () => {
    if (markdown === null) return
    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }))
    link.download = `${jobId}.md`
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const copyContent = tab === "markdown" ? markdown ?? ""
    : tab === "json" ? (report ? JSON.stringify(report, null, 2) : "")
      : tab === "report" ? (report ? serializeRedactionReport(report) : "")
        : serializePlaygroundBlocks(blocks)
  const copyLabel = tab === "markdown" ? "working copy" : tab === "json" ? "JSON report" : tab === "report" ? "redaction report" : "document blocks"
  const copyAvailable = tab === "markdown" ? markdown !== null : tab === "json" || tab === "report" ? report !== null : report !== null || markdown !== null
  const removeOutput = async () => {
    setDeleting(true)
    try { await deleteJob(jobId); clearSource(jobId); purgeResultsCache(jobId); setConfirmingDelete(false); setJob({ ...(job as Job), status: "purged" }) } catch (e) { setActionError(friendlyError(e)) } finally { setDeleting(false) }
  }

  const sourceFile = getSource(jobId)
  const workflowStage = completed ? (workflowState === "failed" ? "failed" : resultsReadable ? "review" : "prepare") : job?.status === "failed" ? "failed" : job?.status === "purged" ? "purged" : job?.status === "queued" || job?.status === "processing" ? "prepare" : "upload"
  const workflowSteps = [
    { id: "upload", label: "Upload" },
    { id: "prepare", label: "Prepare" },
    { id: "review", label: "Review" },
  ] as const
  const sourcePane = completed && sourceFile ? (
    <Suspense fallback={<div className="playground-empty"><h2 role="status">Loading result…</h2></div>}>
      <SourcePreview file={sourceFile} blocks={blocks} pages={report?.pages} selectedBlockId={selectedBlockId} onSelectBlock={setSelectedBlockId} />
    </Suspense>
  ) : (
    <div className="playground-empty">
      <p>{SOURCE_SESSION_UNAVAILABLE}</p>
    </div>
  )

  let resultBody: React.ReactNode
  if (tab === "blocks") resultBody = <BlocksView blocks={blocks} selectedBlockId={selectedBlockId} onSelectBlock={setSelectedBlockId} />
  else if (tab === "markdown") resultBody = markdown !== null ? (
    <div>
      <p className="playground-note">A plain-text view of the prepared document.</p>
      <article className="playground-markdown" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  ) : markdownError ? <Alert><h2>Result could not be displayed</h2><p>{markdownError}</p></Alert> : <p className="job-result-loading">Loading result…</p>
  else if (tab === "report") resultBody = report !== null ? <ReportView report={report} /> : reportError ? <Alert><h2>Result could not be displayed</h2><p>{reportError}</p></Alert> : <p className="job-result-loading">Loading result…</p>
  else resultBody = report !== null ? <pre className="playground-json">{JSON.stringify(report, null, 2)}</pre> : reportError ? <Alert><h2>Result could not be displayed</h2><p>{reportError}</p></Alert> : <p className="job-result-loading">Loading result…</p>

  let body: React.ReactNode
  if (error && markdown === null && report === null) body = <Alert><p>{error}</p></Alert>
  else if (!job) body = <div className="playground-empty"><p>Loading…</p></div>
  else if (job.status === "queued" || job.status === "processing") body = (
    <div className="playground-empty">
      <ProcessingState message={job.status === "queued" ? "Waiting to start…" : "Preparing document…"} />
      <p>This page updates automatically when preparation is complete.</p>
    </div>
  )
  else if (job.status === "failed" || workflowState === "failed") body = <Alert><h2>Document could not be processed</h2><p>{job.error?.message ?? "Document could not be processed"}</p></Alert>
  else if (job.status === "rejected") body = <Alert><h2>Document was not accepted</h2><p>{job.error?.message ?? "Document was not accepted"}</p></Alert>
  else if (job.status === "purged") body = (
    <div className="playground-empty"><h2>Output is no longer available</h2><p>This document's output has expired or was deleted.</p></div>
  )
  else if (!resultsReadable && (workflowState === "queued" || workflowState === "running")) body = (
    <div className="playground-empty"><ProcessingState message="Running workflow…" /><p>This page updates automatically when preparation is complete.</p></div>
  )
  else if (!completed) body = <div className="playground-empty"><h2 role="status">Loading result…</h2></div>
  else body = <ReviewWorkspace
    title={resultReady ? "Ready to review" : "Loading result…"}
    source={sourcePane}
    output={<Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
      <TabsList aria-label="Document views">
        {PUBLIC_TABS.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}
      </TabsList>
      <TabsContent value={tab}>
        {copyAvailable && <div className="job-result-actions"><CopyControl key={copyLabel} content={copyContent} label={copyLabel} failureMessage={tab === "markdown" ? "Copy failed. Use Download working copy instead." : undefined} /></div>}
        {resultBody}
      </TabsContent>
    </Tabs>}
  />

  const actions = resultsReadable ? <>
    {actionError && <Alert><p>{actionError}</p></Alert>}
    <div className="playground-actions">
      {markdown !== null && <button type="button" className="ll-button ll-button-secondary" onClick={downloadMarkdown}><Download size={14} aria-hidden="true" /> Download working copy</button>}
      <button type="button" className="ll-button ll-button-destructive" onClick={() => setConfirmingDelete(true)}><Trash2 size={14} aria-hidden="true" /> Delete output</button>
    </div>
    <AlertDialog open={confirmingDelete} onOpenChange={(open) => { if (!deleting) setConfirmingDelete(open) }}><AlertDialogContent><AlertDialogTitle>Delete this output?</AlertDialogTitle><AlertDialogDescription>The prepared document and report will be removed immediately. This cannot be undone.</AlertDialogDescription>{actionError && <Alert><p>{actionError}</p></Alert>}<div className="ll-alert-actions"><AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void removeOutput() }} disabled={deleting}>{deleting ? "Deleting…" : "Delete output"}</AlertDialogAction></div></AlertDialogContent></AlertDialog>
  </> : null

  // Protected contract-review artifacts are rendered only by WorkflowShell; this legacy result page exposes source and generic result views.
  if (!workflow || workflow.id === "contract-review") return <Shell><p role="status">Workflow unavailable.</p></Shell>

  return (
    <Shell workflowId={workflow.id} reviewWorkspace>
      <h1 ref={headingRef} tabIndex={-1} className="visually-hidden">{workflow.label}</h1>
      <nav className="job-context-bar" aria-label="Workspace navigation">
        <button type="button" className="context-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} aria-hidden="true" /> Back
        </button>
        <span className="context-doc">{sourceFile?.name ?? "Your document"}</span>
        <span className="context-workflow"><strong>{workflow.label}</strong></span>
        <a className="context-link context-new" href="/playground/">
          <FilePlus2 size={14} aria-hidden="true" /> Alias document
        </a>
      </nav>

      <div className="job-context-meta">
        <ol className="workflow-progress" aria-label="Document workflow">
          {workflowSteps.map((step, index) => {
            const current = step.id === workflowStage
            const complete = (workflowStage === "prepare" && index === 0) || (workflowStage === "review" && index < 2)
            const failed = workflowStage === "failed" && step.id === "prepare"
            return <li key={step.id} className={current ? "current" : complete ? "complete" : failed ? "failed" : ""} aria-current={current ? "step" : undefined} aria-label={failed ? `${step.label}, failed` : complete ? `${step.label}, complete` : step.label}>
              <span className="workflow-step-marker" aria-hidden="true">{complete ? "✓" : index + 1}</span>{step.label}
            </li>
          })}
        </ol>
        {expiry && <span className="context-readout">Output available until {expiry}</span>}
        {expiry && blocks.length > 0 && (
          <span className="context-readout">{new Set(blocks.map((b) => b.page)).size} page(s) · {Object.values(report?.entity_counts ?? {}).reduce((a, v) => a + v, 0)} items redacted</span>
        )}
      </div>

      {actions}
      {body}
    </Shell>
  )
}

function BlocksView({ blocks, selectedBlockId, onSelectBlock }: { blocks: Block[]; selectedBlockId?: string | null; onSelectBlock?: (id: string) => void }) {
  // Reverse highlight: selecting an overlay region in SourcePreview scrolls its list entry into view.
  useEffect(() => {
    if (!selectedBlockId) return
    document.getElementById(selectedBlockId)?.scrollIntoView({ block: "nearest" })
  }, [selectedBlockId])

  if (blocks.length === 0) return (
    <div className="playground-empty">
      <h2>No structured blocks</h2>
      <p>This document type has no block layout (DOCX/TXT). Use the Markdown view.</p>
    </div>
  )
  return (
    <ol className="block-list" aria-label="Document blocks">
      {blocks.map((b) => {
        const flagged = hasRedactionPlaceholder(b)
        const selected = b.id === selectedBlockId
        return (
          <li
            key={b.id}
            id={b.id}
            className={`block-item block-${b.type}${b.confidence < LOW_CONFIDENCE_THRESHOLD ? " block-low" : ""}${selected ? " block-selected" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onClick={() => onSelectBlock?.(b.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onSelectBlock?.(b.id)
              }
            }}
          >
            <div className="block-meta">
              <span>{b.type}</span>
              <span>p.{b.page}</span>
              {b.confidence < LOW_CONFIDENCE_THRESHOLD && <span className="block-flag">low confidence</span>}
              {flagged && <span className="block-flag">block-level, approximate</span>}
            </div>
            <p>{b.text}</p>
          </li>
        )
      })}
    </ol>
  )
}

function ReportView({ report }: { report: Report }) {
  const entries = Object.entries(report.entity_counts)
  const label = (key: string) => entityLabels[key] ?? key.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase())

  return (
    <div className="redaction-report">
      <p className="result-notice" role="note"><strong>Review outputs before use in your practice.</strong></p>
      {entries.length === 0
        ? <p className="report-empty">No personal information detected.</p>
        : (
          <div className="table-scroll" role="region" aria-label="Redaction counts" tabIndex={0}>
            <table className="report-table">
              <thead><tr><th scope="col">Type</th><th scope="col">Count</th></tr></thead>
              <tbody>{entries.map(([k, v]) => <tr key={k}><td>{label(k)}</td><td>{v}</td></tr>)}</tbody>
            </table>
          </div>
        )
      }
      <p>Low-confidence spans: {report.low_confidence_spans.length}</p>
      <p>Unprocessed pages: {report.unprocessed_pages.length ? report.unprocessed_pages.join(", ") : "none"}</p>
      <p>Dropped images: {report.dropped_images}</p>
    </div>
  )
}
