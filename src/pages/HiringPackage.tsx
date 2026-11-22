import { useEffect, useRef, useState } from "react"
import { HiringDescriptionReviewPrototype } from "@/components/HiringPackagePrototype"
import { SessionSourceIntake } from "@/components/intake/SessionSourceIntake"
import { CopyControl } from "@/components/CopyControl"
import { ProcessingState } from "@/components/ProcessingState"
import { useProcessingFocus } from "@/components/useProcessingFocus"
import { WorkflowPage } from "@/components/WorkflowPage"
import { validateFile } from "@/components/FileIntake"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ApiError, approveHiringPackage, createHiringPackageSession, deleteHiringPackage, generateHiringPackage, type HrSource } from "@/lib/api"
import { useTier } from "@/lib/useTier"
import type { Workflow } from "@/lib/workflows"

type Stage =
  | { kind: "intake" }
  | { kind: "processing" }
  | { kind: "review"; id: string; text: string; changed: boolean }
  | { kind: "expired"; source: HrSource }
  | { kind: "approved"; sub: string | null; id: string; versionId: string; text: string }

function message(error: unknown) {
  if (error instanceof ApiError && error.status === 503 && error.code === "llm_not_configured") return "Job description preparation is not available yet."
  if (error instanceof ApiError && error.status === 429 && error.code === "rate_limit_exceeded") return "Too many requests. Try again shortly."
  return "We could not prepare this job description. Try again."
}

const resumeKey = "hiring-package-approved"
type Approved = Extract<Stage, { kind: "approved" }>
// sub is the opaque account ID from /api/auth/session: no name, email, or digest is stored.
type Resume = { sub: string; id: string; versionId: string; text: string }

// Exact shape only. Anything malformed, or with extra keys, is removed rather than kept.
function readResume(): Resume | null {
  let resume: Resume | null = null
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(resumeKey) ?? "null")
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).sort().join(",") === "id,sub,text,versionId") {
      const { sub, id, versionId, text } = parsed as Record<string, unknown>
      if (typeof sub === "string" && sub && typeof id === "string" && typeof versionId === "string" && typeof text === "string") resume = { sub, id, versionId, text }
    }
  } catch { /* unreadable JSON is malformed */ }
  if (!resume) sessionStorage.removeItem(resumeKey)
  return resume
}

function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = "job-description.md"
  anchor.click()
  URL.revokeObjectURL(url)
}

export function HiringPackagePanel({ workflow }: { workflow: Workflow }) {
  const { ready, signedIn, identity, login } = useTier()
  // Null when signed out or when the session has no usable sub: owner-bound resume is then neither saved nor restored.
  // Any identity change resets the stage; the approved view also requires stage.sub === sub so no old result renders in between.
  const sub = signedIn ? identity?.sub ?? null : null
  const [mode, setMode] = useState<"file" | "text">("text")
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>({ kind: "intake" })
  const [error, setError] = useState<string | null>(null)
  const [liveSession, setLiveSession] = useState(false)
  const [approving, setApproving] = useState(false)
  const { processingRef, captureFocus } = useProcessingFocus(stage.kind === "processing")
  const sessionId = useRef<string | null>(null)
  const sequence = useRef(0)
  const sourceRef = useRef<HrSource | null>(null)
  const approvalRequest = useRef<number | null>(null)

  const deleteSession = () => {
    const id = sessionId.current
    sessionId.current = null
    approvalRequest.current = null
    setLiveSession(false)
    if (id) void deleteHiringPackage(id).catch(() => {})
  }

  useEffect(() => () => { sequence.current++; deleteSession() }, [])

  // Any auth change drops in-flight work and in-memory state, then restores only a resume owned by the current identity.
  useEffect(() => {
    if (!ready) return
    sequence.current++
    deleteSession()
    setApproving(false)
    setStage({ kind: "intake" })
    const stored = readResume()
    if (!stored) return
    if (sub !== null && stored.sub === sub) setStage({ kind: "approved", sub, id: stored.id, versionId: stored.versionId, text: stored.text })
    else sessionStorage.removeItem(resumeKey)
  }, [ready, signedIn, sub])

  useEffect(() => {
    if (!liveSession) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [liveSession])

  const prepare = async (source: HrSource) => {
    const request = ++sequence.current
    sourceRef.current = source
    setError(null)
    setStage({ kind: "processing" })
    try {
      const session = await createHiringPackageSession(source)
      if (request !== sequence.current) return void deleteHiringPackage(session.id).catch(() => {})
      sessionId.current = session.id
      setLiveSession(true)
      const draft = await generateHiringPackage(session.id)
      if (request !== sequence.current) return
      setStage({ kind: "review", id: session.id, text: draft.text, changed: draft.changed })
    } catch (cause) {
      if (request !== sequence.current) return
      if (cause instanceof ApiError && cause.status === 410) {
        sessionId.current = null
        setLiveSession(false)
        setStage({ kind: "expired", source: sourceRef.current ?? source })
      } else {
        deleteSession()
        setStage({ kind: "intake" })
        setError(message(cause))
      }
    }
  }

  const submit = () => {
    if (mode === "file" && file) return void prepare({ kind: "pdf", file })
    if (mode === "text" && text.trim()) void prepare({ kind: "pasted_text", text })
  }

  const approve = async (id: string, draft: string) => {
    if (approvalRequest.current !== null) return
    const request = ++sequence.current
    approvalRequest.current = request
    setApproving(true)
    setError(null)
    try {
      const approved = await approveHiringPackage(id, draft)
      if (request !== sequence.current) return
      sessionId.current = null
      setLiveSession(false)
      const resume: Approved = { kind: "approved", sub, id: approved.id, versionId: approved.versionId, text: approved.text }
      if (sub) {
        try { sessionStorage.setItem(resumeKey, JSON.stringify({ sub, id: resume.id, versionId: resume.versionId, text: resume.text })) } catch { /* resume is best-effort; approval already succeeded */ }
      }
      setStage(resume)
    } catch (cause) {
      if (request !== sequence.current) return
      if (cause instanceof ApiError && cause.status === 410) {
        sessionId.current = null
        setLiveSession(false)
        setStage({ kind: "expired", source: sourceRef.current ?? { kind: "pasted_text", text: draft } })
      } else setError(message(cause))
    } finally {
      if (approvalRequest.current === request) approvalRequest.current = null
      if (request === sequence.current) setApproving(false)
    }
  }

  if (!ready) return null
  if (!signedIn) return <section aria-labelledby="hiring-package-signin"><h2 id="hiring-package-signin">Sign in to prepare a job description</h2><p>Preparing and approving a job description requires a member account.</p><Button variant="primary" onClick={login}>Sign in</Button></section>
  if (sub === null) return <section aria-labelledby="hiring-package-identity"><h2 id="hiring-package-identity">Unable to verify your account</h2><p>Preparing and approving a job description requires a verified member account. Please sign in again.</p><Button variant="primary" onClick={login}>Sign in</Button></section>

  const recover = (source: HrSource) => {
    if (source.kind === "pdf") { setFile(source.file); setMode("file") }
    else { setText(source.text); setMode("text") }
    setStage({ kind: "intake" })
  }
  return <div className="hr-hiring">
    {stage.kind === "intake" && <section aria-labelledby="hiring-package-source">
      <h2 id="hiring-package-source" className="visually-hidden">Original source</h2>
      <SessionSourceIntake modes={workflow.inputModes} mode={mode} onMode={setMode} file={file} onFile={async (selected) => {
        const invalid = selected ? await validateFile(selected, workflow.acceptedFileTypes ?? []) : null
        setFile(invalid ? null : selected ?? null)
        setError(invalid)
      }} text={text} onText={setText} busy={false} acceptedFileTypes={workflow.acceptedFileTypes ?? []} />
      <Button variant="primary" disabled={mode === "file" ? !file : !text.trim()} onClick={() => { captureFocus(); submit() }}>{workflow.action}</Button>
      {error && <Alert>{error}</Alert>}
    </section>}
    {stage.kind === "processing" && <ProcessingState statusRef={processingRef} focusOnMount message="Preparing job description…" />}
    {stage.kind === "review" && <section>
      <HiringDescriptionReviewPrototype live draft={stage.text} changed={stage.changed} screeningState="ready" pending={approving} onApprove={(draft) => { captureFocus(); void approve(stage.id, draft) }} onRepost={(text) => recover({ kind: "pasted_text", text })} />
      {error && <Alert>{error}</Alert>}
      <Button variant="secondary" disabled={approving} onClick={() => { sequence.current++; setApproving(false); deleteSession(); sourceRef.current = null; setText(""); setFile(null); setError(null); setStage({ kind: "intake" }) }}>Discard and start again</Button>
    </section>}
    {stage.kind === "expired" && <Alert><p>This review expired. Re-submit the original source to recover it.</p><Button variant="secondary" onClick={() => recover(stage.source)}>Re-submit original source</Button></Alert>}
    {stage.kind === "approved" && stage.sub === sub && <section aria-labelledby="hiring-package-approved">
      <h2 id="hiring-package-approved">Approved job description</h2><p>Version {stage.versionId}</p><pre>{stage.text}</pre>
      <div className="job-result-actions"><Button variant="secondary" onClick={() => download(stage.text)}>Download Markdown</Button><CopyControl content={stage.text} label="approved job description" failureMessage="Copy failed. Download Markdown for the job description." /><Button variant="primary" onClick={() => { sessionStorage.removeItem(resumeKey); setText(""); setFile(null); setStage({ kind: "intake" }) }}>Start new</Button></div>
    </section>}
  </div>
}

export function HiringPackage({ workflow }: { workflow: Workflow }) {
  const { ready } = useTier()
  if (!ready) return null
  return <WorkflowPage workflow={workflow} uploadLabel="Original source"><HiringPackagePanel workflow={workflow} /></WorkflowPage>
}
