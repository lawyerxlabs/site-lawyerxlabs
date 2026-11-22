import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Block, Job, Report } from "@/lib/api"
import { ApiError, deleteJob, friendlyError, getMarkdown, getReport } from "@/lib/api"
import { pollJob } from "@/lib/pollJob"
import { Alert } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { ProcessingState } from "@/components/ProcessingState"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { entityLabels } from "@/lib/entityLabels"
import { serializeRedactionReport, serializeRenderedDocument } from "@/lib/resultCopy"
import { renderMarkdown } from "@/lib/markdown"
import { CopyControl } from "@/components/CopyControl"

type JobStatusProps = {
  job: Job
  onCancel: () => void
  onRetry: () => void
  onDone: () => void
  onJobUpdate: (job: Job) => void
}

const STATUS_RANK: Record<Job["status"], number> = { queued: 0, processing: 1, completed: 2, failed: 2, rejected: 2, purged: 3 }

// Result endpoints are read-once; retain each settled promise so partial success
// survives remounts and failed reads are never silently retried.
const markdownCache = new Map<string, Promise<string>>()
const reportCache = new Map<string, Promise<Report>>()
// Deleted or purged jobs: never read or reveal their results again.
const spent = new Set<string>()
function evictResults(jobId: string) {
  spent.add(jobId)
  markdownCache.delete(jobId)
  reportCache.delete(jobId)
}
function loadMarkdown(jobId: string) {
  let request = markdownCache.get(jobId)
  if (!request) {
    request = getMarkdown(jobId)
    markdownCache.set(jobId, request)
  }
  return request
}
function loadReport(jobId: string) {
  let request = reportCache.get(jobId)
  if (!request) {
    request = getReport(jobId)
    reportCache.set(jobId, request)
  }
  return request
}

const entityLabel = (key: string) => entityLabels[key] ?? key.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase())

export function JobStatus({ job, onCancel, onRetry, onDone, onJobUpdate }: JobStatusProps) {
  const [jobKey, setJobKey] = useState(job.job_id)
  const [currentJob, setCurrentJob] = useState(job)
  const [pollError, setPollError] = useState<string | null>(null)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Async delete callbacks compare against the job currently on screen, not the one they started for.
  const shownId = useRef(job.job_id)
  const query = new URLSearchParams(window.location.search)
  const devMode = query.get("dev") === "1" || query.get("tab") === "json"
  const [activeTab, setActiveTab] = useState<"document" | "markdown" | "report" | "json">(() => query.get("tab") === "json" ? "json" : "document")

  const [attempt, setAttempt] = useState(0)
  const refresh = useCallback(() => {
    setPollError(null)
    setAttempt((n) => n + 1)
  }, [])

  // Reset in render (not in an effect) so no effect ever sees the previous job's state against the new job ID.
  if (jobKey !== job.job_id) {
    setJobKey(job.job_id)
    setCurrentJob(job)
    setPollError(null)
    setMarkdown(null)
    setReport(null)
    setResultError(null)
    setDeleting(false)
    setConfirmingDelete(false)
  }

  useEffect(() => {
    shownId.current = job.job_id
  }, [job.job_id])

  // Same-ID prop updates advance currentJob but never regress it (e.g. polled completed vs stale queued prop).
  // Equal rank with a different status (completed vs failed) is rejected: the poll owns that terminal flip.
  useEffect(() => {
    setCurrentJob((current) => (job.status === current.status || STATUS_RANK[job.status] > STATUS_RANK[current.status] ? job : current))
  }, [job])

  useEffect(() => {
    if (currentJob.status !== "queued" && currentJob.status !== "processing") return
    return pollJob(job.job_id, {
      initialDelay: 2000,
      interval: 5000,
      onJob: (next) => {
        setCurrentJob(next)
        onJobUpdate(next)
        setPollError(null)
      },
      onError: (error) => setPollError(friendlyError(error)),
    })
  }, [currentJob.status, job.job_id, attempt, onJobUpdate])

  useEffect(() => {
    if (currentJob.status === "purged") {
      evictResults(job.job_id)
      setMarkdown(null)
      setReport(null)
      setResultError(null)
    }
  }, [currentJob.status, job.job_id])

  useEffect(() => {
    if (currentJob.status !== "completed" || spent.has(job.job_id)) return
    let stopped = false
    const live = () => !stopped && !spent.has(job.job_id)
    // Independent: each artifact renders on its own resolve; a failure only sets the error alert.
    loadMarkdown(job.job_id).then(
      (value) => { if (live()) setMarkdown(value) },
      (error) => { if (live()) setResultError(friendlyError(error)) },
    )
    loadReport(job.job_id).then(
      (value) => { if (live()) setReport(value) },
      (error) => { if (live()) setResultError(friendlyError(error)) },
    )
    return () => {
      stopped = true
    }
  }, [currentJob.status, job.job_id])

  const markdownHtml = useMemo(() => markdown === null ? "" : renderMarkdown(markdown), [markdown])

  const download = (name: string, content: BlobPart, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const link = document.createElement("a")
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
  }

  const copyContent = activeTab === "markdown" ? markdown ?? ""
    : activeTab === "json" ? (report ? JSON.stringify(report, null, 2) : "")
      : activeTab === "report" ? (report ? serializeRedactionReport(report, { emptyMessage: "No supported sensitive information was detected.", confidenceLabel: "items", emptyPagesLabel: "None" }) : "")
        : serializeRenderedDocument(report?.blocks ?? []) || markdown || ""
  const copyLabel = activeTab === "markdown" ? "working copy" : activeTab === "json" ? "JSON report" : activeTab === "report" ? "redaction report" : "document"

  const removeOutput = async () => {
    const deletedId = job.job_id
    setDeleting(true)
    try {
      await deleteJob(deletedId)
      evictResults(deletedId)
      if (shownId.current === deletedId) {
        setMarkdown(null)
        setReport(null)
        setResultError(null)
        onDone()
      }
    } catch (error) {
      if (shownId.current === deletedId) setResultError(friendlyError(error))
    } finally {
      if (shownId.current === deletedId) {
        setDeleting(false)
        setConfirmingDelete(false)
      }
    }
  }

  const active = currentJob.status === "queued" || currentJob.status === "processing"
  const resultLoading = currentJob.status === "completed" && (markdown === null || report === null) && !resultError
  const statusText = currentJob.status === "queued" ? "Waiting to start…" : currentJob.status === "processing" ? "Preparing document…" : resultLoading ? "Loading result…" : currentJob.status === "completed" ? "Ready to review" : currentJob.status === "failed" ? "Document could not be processed" : currentJob.status === "rejected" ? "Document was not accepted" : "Output is no longer available"

  return (
    <section className="job-status">
      {active ? <><ProcessingState message={statusText} /><Button variant="secondary" onClick={onCancel}>Cancel</Button></> : <div className="job-status-line" role="status"><strong>{statusText}</strong></div>}
      {pollError && <Alert><p>{pollError}</p><Button variant="secondary" onClick={refresh}>Retry status check</Button></Alert>}
      {(currentJob.status === "failed" || currentJob.status === "purged") && (
        <Alert><p>{friendlyError(new ApiError(0, currentJob.status === "purged" ? "purged" : currentJob.error?.code ?? "error", currentJob.error?.message ?? ""))}</p><Button onClick={onRetry}>Retry</Button></Alert>
      )}
      {/* Rejection is non-retryable for MVP: terminal message only, no Retry. */}
      {currentJob.status === "rejected" && (
        <Alert><p>{friendlyError(new ApiError(0, currentJob.error?.code ?? "error", currentJob.error?.message ?? ""))}</p></Alert>
      )}
      {currentJob.status === "completed" && (
        <div className="job-result">
          {resultError && <Alert><h2>Result could not be displayed</h2><p>{resultError}</p></Alert>}
          {markdown !== null && report === null ? (
            <div className="job-result-actions" aria-label="Working-copy actions">
              <Button onClick={() => download(`${job.job_id}.md`, markdown, "text/markdown")}>Download working copy</Button>
              <CopyControl content={markdown ?? ""} label="working copy" failureMessage="Copy failed. Use Download working copy instead." />
              <pre className="working-copy-source" aria-label="Markdown source">{markdown}</pre>
            </div>
          ) : report === null ? (
            !resultError && <p className="job-result-loading">Loading result…</p>
          ) : (
            <>
              <div className="job-result-actions" aria-label="Working-copy actions">
                {markdown !== null && <Button onClick={() => download(`${job.job_id}.md`, markdown, "text/markdown")}>Download working copy</Button>}
                <Button variant="destructive" onClick={() => setConfirmingDelete(true)} disabled={deleting}>Delete output</Button>
              </div>
              <AlertDialog open={confirmingDelete} onOpenChange={(open) => { if (!deleting) setConfirmingDelete(open) }}>
                <AlertDialogContent>
                  <AlertDialogTitle>Delete this output?</AlertDialogTitle>
                  <AlertDialogDescription>The prepared document and report will be removed immediately. This cannot be undone.</AlertDialogDescription>
                  <div className="ll-alert-actions">
                    <AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel>
                    <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={removeOutput} disabled={deleting}>Delete output</AlertDialogAction>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
              <DetectionSummary report={report} total={Object.values(report.entity_counts).reduce((sum, count) => sum + count, 0)} />
              <Tabs className="job-result-tabs" value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                <TabsList aria-label="Working-copy views">
                  <TabsTrigger value="document">Document</TabsTrigger>
                  <TabsTrigger value="markdown">Markdown</TabsTrigger>
                  <TabsTrigger value="report">Redaction report</TabsTrigger>
                  {devMode && <TabsTrigger value="json">JSON</TabsTrigger>}
                </TabsList>
                <TabsContent value="document">
                  <div className="job-result-actions"><CopyControl key={copyLabel} content={copyContent} label={copyLabel} failureMessage={activeTab === "markdown" ? "Copy failed. Use Download working copy instead." : undefined} /></div>
                  <DocumentView blocks={report.blocks ?? []} markdownHtml={markdownHtml} />
                </TabsContent>
                <TabsContent value="markdown">
                  <div className="job-result-actions"><CopyControl key={copyLabel} content={copyContent} label={copyLabel} failureMessage={activeTab === "markdown" ? "Copy failed. Use Download working copy instead." : undefined} /></div>
                  <div className="working-copy-source-wrap">
                    <p className="working-copy-note">Markdown source for export and copy.</p>
                    <pre className="working-copy-source" aria-label="Markdown source">{markdown}</pre>
                  </div>
                </TabsContent>
                <TabsContent value="report">
                  <div className="job-result-actions"><CopyControl key={copyLabel} content={copyContent} label={copyLabel} failureMessage={activeTab === "markdown" ? "Copy failed. Use Download working copy instead." : undefined} /></div>
                  <RedactionReport report={report} />
                </TabsContent>
                {devMode && <TabsContent value="json"><div className="job-result-actions"><CopyControl key={copyLabel} content={copyContent} label={copyLabel} /></div><pre className="job-result-json">{JSON.stringify(report, null, 2)}</pre></TabsContent>}
              </Tabs>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function DocumentView({ blocks, markdownHtml }: { blocks: Block[]; markdownHtml: string }) {
  if (blocks.length === 0) {
    return (
      <div className="working-copy-fallback">
        <p className="working-copy-note">A structured layout is not available for this file; a formatted text view is shown.</p>
        <article className="working-copy working-copy-markdown" aria-label="Prepared working copy" dangerouslySetInnerHTML={{ __html: markdownHtml }} />
      </div>
    )
  }

  return (
    <article className="working-copy" aria-label="Prepared working copy">
      {blocks.map((block) => {
        if (block.type === "heading") return <h3 key={block.id}>{block.text}</h3>
        if (block.type === "list_item") return <p key={block.id} className="working-copy-list-item">{block.text}</p>
        if (block.type === "table") return <div key={block.id} className="working-copy-table">{block.text}</div>
        return <p key={block.id}>{block.text}</p>
      })}
    </article>
  )
}

function RedactionReport({ report }: { report: Report }) {
  const total = Object.values(report.entity_counts).reduce((sum, count) => sum + count, 0)
  return <DetectionSummary report={report} total={total} />
}

function DetectionSummary({ report, total }: { report: Report; total: number }) {
  return (
    <section className="report-summary" aria-labelledby="report-summary-title">
      <p className="result-notice" role="note"><strong>Review outputs before use in your practice.</strong></p>
      <div className="report-summary-heading">
          <div>
            <p className="step-label">Detection summary</p>
            <h3 id="report-summary-title">{total} {total === 1 ? "item" : "items"} found</h3>
          </div>
          <span className="report-total">{total}</span>
        </div>
        {Object.keys(report.entity_counts).length ? (
          <dl className="entity-counts">
            {Object.entries(report.entity_counts)
              .sort(([a], [b]) => entityLabel(a).localeCompare(entityLabel(b)))
              .map(([entity, count]) => (
                <div key={entity}>
                  <dt>{entityLabel(entity)}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
          </dl>
        ) : <p className="report-empty">No supported sensitive information was detected.</p>}
        {report.low_confidence_spans.length > 0 && (
          <p className="report-low-confidence">Low-confidence items: {report.low_confidence_spans.length}</p>
        )}
        <dl className="report-meta">
          <div><dt>Dropped images</dt><dd>{report.dropped_images}</dd></div>
          <div><dt>Unprocessed pages</dt><dd>{report.unprocessed_pages.length ? report.unprocessed_pages.join(", ") : "None"}</dd></div>
        </dl>
    </section>
  )
}
