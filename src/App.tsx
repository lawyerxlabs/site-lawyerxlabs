import { useCallback, useState } from "react"
import { FileSearch, LockKeyhole, ServerCog, ShieldCheck, TimerReset } from "lucide-react"
import { Link } from "react-router-dom"
import { FileIntake } from "@/components/FileIntake"
import { Header } from "@/components/Header"
import { JobStatus } from "@/components/JobStatus"
import { ProcessingState } from "@/components/ProcessingState"
import { WaitlistForm } from "@/components/WaitlistForm"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { deleteJob, upload, friendlyError, ApiError, type Job } from "@/lib/api"
import { useTier } from "@/lib/useTier"
import { getAliasWorkflow } from "@/lib/workflows"

function formatExpiryTime(expiresAt: string | null | undefined) {
  if (!expiresAt) return null
  const value = new Date(expiresAt)
  if (Number.isNaN(value.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value)
}

function workspaceStepLabel(job: Job | null) {
  if (!job) return "Document preparation"
  if (job.status === "completed") return "Ready to review"
  if (job.status === "failed") return "Document could not be processed"
  if (job.status === "purged") return "Output is no longer available"
  if (job.status === "queued") return "Waiting to start…"
  return "Preparing document…"
}

export default function App() {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [busy, setBusy] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const { refreshMe } = useTier()
  const docalias = getAliasWorkflow()
  const handleJobUpdate = useCallback((next: Job) => {
    setSelectedJob((current) => current?.job_id === next.job_id ? next : current)
  }, [])

  function reset() {
    setSelectedJob(null)
    setPageError(null)
  }

  function handleCancel() {
    const jobId = selectedJob?.job_id
    if (!jobId) return
    deleteJob(jobId)
      .then(reset)
      .catch((e: unknown) => setPageError(friendlyError(e)))
  }

  function handleExpiryText() {
    return "Results are temporary, held on the server, and expire automatically. Anonymous results are purged after both the document and the report have been read."
  }

  return (
    <div className="app-shell mvp-shell">
      <Header />

      <main className="main-content">
        {!selectedJob && (
          <section className="intro" aria-labelledby="page-title">
            <p className="eyebrow"><ShieldCheck size={16} aria-hidden="true" /> LawyerLab tool</p>
            <h1 id="page-title">You want to use AI. Your clients' details need to stay private.</h1>
            <p className="lede">One rushed copy and paste can put a client's name, address or account details into a tool you haven't vetted.</p>
            <p className="intro-details">Checking by hand takes time, and a busy day rarely leaves much to spare.</p>
            <p className="intro-details">LawyerLab helps you explore AI with care. We start with Document Alias, which swaps detected personal details for placeholders, so you can review a working copy and move on to your AI tool sooner.</p>
          </section>
        )}

        {!selectedJob && (
          <aside className="trust-band" aria-label="Trust summary">
            <ul className="trust-band-labels">
              <li>Personal details replaced with placeholders</li>
              <li>Source files deleted after processing</li>
              <li>You review every result</li>
            </ul>
            <Button asChild variant="secondary" size="sm"><Link to="/commitments/">Our commitments</Link></Button>
          </aside>
        )}

        {!selectedJob && (
          <section className="assurances" aria-label="How this tool works">
            <article><span>01</span><div><h3>Upload</h3><p>PDF or DOCX, one document at a time.</p></div></article>
            <article><span>02</span><div><h3>Prepare</h3><p>Personal information is identified and replaced.</p></div></article>
            <article><span>03</span><div><h3>Review</h3><p>Check the working copy and report before use.</p></div></article>
          </section>
        )}

        <section className="workspace" aria-label="Alias">
          <div className="workspace-heading">
            <div>
              <p className="step-label">{workspaceStepLabel(selectedJob)}</p>
              <h2>{selectedJob ? "Your document" : "Alias"}</h2>
            </div>
            {selectedJob ? (
              formatExpiryTime(selectedJob.expires_at) && <span className="workspace-readout">expires {formatExpiryTime(selectedJob.expires_at)}</span>
            ) : <span className="file-types">PDF · DOCX</span>}
          </div>

          {pageError && <Alert><p>{pageError}</p></Alert>}
          {selectedJob ? (
            <JobStatus job={selectedJob} onCancel={handleCancel} onRetry={reset} onDone={reset} onJobUpdate={handleJobUpdate} />
          ) : (
            <>
            {busy && <ProcessingState focusOnMount message="Uploading document…" />}
            <div hidden={busy}><FileIntake
              samples={docalias?.samples ?? []}
              inputModes={docalias?.inputModes ?? []}
              busy={busy}
              onSubmit={(file, token) => {
                setBusy(true)
                setPageError(null)
                upload(file, token)
                  .then((job) => {
                    setSelectedJob(job)
                    void refreshMe().catch(() => {})
                  })
                  .catch((e: unknown) => {
                    setPageError(friendlyError(e))
                    if (e instanceof ApiError && e.status === 429) void refreshMe().catch(() => {})
                  })
                  .finally(() => setBusy(false))
              }}
            /></div>
            </>
          )}

          <div className="retention-note">
            <LockKeyhole size={16} aria-hidden="true" />
            <p><strong>Temporary by design.</strong> {handleExpiryText()}</p>
          </div>
        </section>

        {!selectedJob && (
          <section className="handling" aria-labelledby="handling-title">
            <div className="handling-heading">
              <p className="step-label">Before you upload</p>
              <h2 id="handling-title">What this tool does</h2>
              <p>Alias detects personal information such as names, contact details, and identifiers in one document. It replaces each one with a placeholder in a working copy and writes a report listing what was found, so you can check the copy against the original.</p>
            </div>
            <div className="handling-grid">
              <article>
                <span className="handling-icon" aria-hidden="true"><TimerReset size={19} /></span>
                <div><h3>Source deleted after processing</h3><p>Your uploaded file is removed when processing completes or fails.</p></div>
              </article>
              <article>
                <span className="handling-icon" aria-hidden="true"><ServerCog size={19} /></span>
                <div><h3>Temporary results</h3><p>Results are held on the server only until they expire. Anonymous results are also removed once both the document and the report have been read.</p></div>
              </article>
              <article>
                <span className="handling-icon" aria-hidden="true"><FileSearch size={19} /></span>
                <div><h3>Review before use</h3><p>Every result includes a report of what was found. Automated detection can miss personal information.</p></div>
              </article>
            </div>
          </section>
        )}

        {!selectedJob && (
          <section className="waitlist" aria-labelledby="waitlist-title">
            <p className="step-label">What’s next</p>
            <h2 id="waitlist-title">More LawyerLab tools are on the way.</h2>
            <p>Joining the waitlist does not enable access automatically.</p>
            <WaitlistForm source="lawyerlab" />
          </section>
        )}
      </main>

      <footer>
        <span>LawyerLab is a Lawtrepreneur product.</span>
        <span>Automated detection can miss personal information. Review outputs before use in your practice.</span>
      </footer>
    </div>
  )
}
