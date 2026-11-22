import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { X } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { checkJsonFile, DEFAULT_FILE_TYPES, listFileTypes, MAX_UPLOAD_BYTES, orderedInputModes, pastedJsonFile, pastedTextFile } from "@/lib/inputModes"
import type { InputMode } from "@/lib/workflows"
import { HumanVerification, type HumanVerificationHandle } from "@/components/intake/HumanVerification"
import { MultiFileIntake } from "@/components/intake/MultiFileIntake"
import { SourceIntake } from "@/components/intake/SourceIntake"
import type { SampleDocument } from "@/components/intake/SingleFileIntake"

export type FileIntakeProps = {
  onSubmit: (file: File, token: string) => void
  onFileChange?: (file: File | null) => void
  busy: boolean
  samples?: readonly SampleDocument[]
  submitLabel?: string
  // Homepage Alias card: small upload icon, one-line empty prompt, tighter spacing, no review-note (page shows its own disclaimer).
  compact?: boolean
  // Compact only: copy shown between the samples and the verification widget.
  note?: ReactNode
  // Enabled input modes; more than one shows the mode selector. Defaults to file-only.
  inputModes?: readonly InputMode[]
  // Backend file extensions; absent = PDF and DOCX.
  acceptedFileTypes?: readonly string[]
}

const FILE_ONLY: readonly InputMode[] = ["file"]
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const ZIP_MAGICS = [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]] // gateway-supported zip signatures
// txt has no magic bytes: extension and MIME are the only check (plain text has no signature).
const FILE_KINDS: Record<"pdf" | "docx" | "txt", { mimes: string[]; magics: number[][] }> = {
  pdf: { mimes: ["application/pdf"], magics: [[0x25, 0x50, 0x44, 0x46]] }, // %PDF
  // Browsers often report DOCX as a generic zip MIME; the magic bytes decide.
  docx: { mimes: [DOCX_MIME, "application/zip", "application/x-zip-compressed"], magics: ZIP_MAGICS },
  txt: { mimes: ["text/plain"], magics: [] },
}
export async function validateFile(file: File, acceptedFileTypes: readonly string[] = DEFAULT_FILE_TYPES): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase()
  const kind = ext && acceptedFileTypes.includes(`.${ext}`) ? FILE_KINDS[ext as keyof typeof FILE_KINDS] : undefined
  if (!ext || !kind) return `Choose a ${listFileTypes(acceptedFileTypes)} file.`
  const label = ext.toUpperCase()
  if (file.size === 0) return "File cannot be empty."
  if (file.size > MAX_UPLOAD_BYTES) return `File is larger than 10 MB. Choose a smaller ${listFileTypes(acceptedFileTypes)}.`
  // Browsers/OS may send blank or octet-stream MIME; magic bytes are the real check.
  if (file.type && !kind.mimes.includes(file.type) && file.type !== "application/octet-stream") return `That file is not a valid ${label}.`
  if (kind.magics.length === 0) return null
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    if (!kind.magics.some((magic) => magic.every((byte, i) => head[i] === byte))) return `That file is not a valid ${label}.`
  } catch {
    return `Could not read that file. Choose another ${listFileTypes(acceptedFileTypes)} file.`
  }
  return null
}


export function FileIntake({ onSubmit, onFileChange, busy, samples = [], compact = false, note, submitLabel = "Alias Document", inputModes = FILE_ONLY, acceptedFileTypes = DEFAULT_FILE_TYPES }: FileIntakeProps) {
  // Empty resolved modes mean the surface disallows every intake; never fall back to file.
  const noModes = inputModes.length === 0
  const modes = orderedInputModes(inputModes)
  const [mode, setMode] = useState<InputMode>(modes[0])
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [token, setToken] = useState("")
  const [error, setError] = useState("")
  const busyRef = useRef(busy)
  busyRef.current = busy
  const pickSeq = useRef(0)
  const sampleRequest = useRef<AbortController | undefined>(undefined)
  const verification = useRef<HumanVerificationHandle>(null)
  const [tab, setTab] = useState<"upload" | "sample">("upload")

  useEffect(() => () => { supersede() }, [])

  // Unmount/cleanup: invalidate any in-flight sample fetch and pending validation.
  function supersede() {
    sampleRequest.current?.abort()
    sampleRequest.current = undefined
    return ++pickSeq.current
  }

  // Every local pick/clear or sample click replaces the prior file synchronously, so a stale file is never submit-ready.
  function beginPick() {
    setFile(null)
    onFileChange?.(null)
    return supersede()
  }

  async function commitFile(seq: number, nextFile: File, validate: (file: File) => Promise<string | null> = (f) => validateFile(f, acceptedFileTypes)) {
    const problem = await validate(nextFile)
    if (seq !== pickSeq.current || busyRef.current) return
    if (problem) {
      setFile(null)
      onFileChange?.(null)
      setError(problem)
      return
    }
    setFile(nextFile)
    onFileChange?.(nextFile)
    setError("")
  }

  function selectFile(nextFile: File | undefined) {
    if (busyRef.current) return
    const seq = beginPick()
    if (nextFile) void commitFile(seq, nextFile)
  }

  // Mode switch drops every selection and pending pick so nothing from the old mode can submit.
  function switchMode(next: InputMode) {
    if (busyRef.current || next === mode) return
    supersede()
    setFile(null)
    onFileChange?.(null)
    setText("")
    setError("")
    setMode(next)
  }

  // Typing replaces any selected JSON file, so the pasted text is the only submit source.
  function changeText(value: string) {
    if (busyRef.current) return
    beginPick()
    setText(value)
    setError("")
  }

  function selectJsonFile(nextFile: File | undefined) {
    if (busyRef.current) return
    const seq = beginPick()
    setText("")
    setError("")
    if (nextFile) void commitFile(seq, nextFile, checkJsonFile)
  }

  // Switching source tabs drops the shared file/error and cancels any pending sample so it cannot select later.
  function switchTab(next: "upload" | "sample") {
    setTab(next)
    setError("")
    beginPick()
  }

  async function useSampleDocument(sample: { url: string; filename: string }) {
    if (busyRef.current) return
    const seq = beginPick()
    const request = new AbortController()
    sampleRequest.current = request
    try {
      const response = await fetch(sample.url, { signal: request.signal })
      if (!response.ok) throw new Error("sample fetch failed")
      const contents = await response.arrayBuffer()
      if (request.signal.aborted) return
      await commitFile(seq, new File([contents], sample.filename, { type: sample.filename.endsWith(".pdf") ? "application/pdf" : sample.filename.endsWith(".txt") ? "text/plain" : DOCX_MIME }))
    } catch {
      if (!request.signal.aborted) setError("Could not load sample document.")
    }
  }

  function handleFile(nextFile: File | undefined) {
    if (mode === "json") selectJsonFile(nextFile)
    else selectFile(nextFile)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !token.trim()) return
    // Validate before consuming the single-use token so a rejected paste keeps the verification.
    const submitFile = mode === "text" ? pastedTextFile(text) : mode === "json" && !file ? pastedJsonFile(text) : file
    if (!submitFile) return
    if (typeof submitFile === "string") {
      setError(submitFile)
      return
    }
    // Turnstile tokens are single-use: consume and reset before handing off, so a retry needs a fresh callback.
    const submitted = token
    setToken("")
    verification.current?.reset()
    onSubmit(submitFile, submitted)
  }

  if (noModes) return <Alert><p>This workflow needs an update before documents can be submitted.</p></Alert>

  // Single-mode workflows render exactly the original form; the selector only appears for multi-mode.
  const multiMode = modes.length > 1
  const ready = Boolean(file) || mode === "text" || mode === "json"
  const submit = (
    <Button className="submit-button" type="submit" disabled={busy || !ready || !token.trim()}>
      {busy ? "Uploading document…" : submitLabel}
    </Button>
  )

  return (
    <form className={`intake-form${compact ? " is-compact" : ""}`} onSubmit={handleSubmit}>
      {multiMode && <MultiFileIntake modes={modes} mode={mode} busy={busy} onMode={switchMode} />}
      <SourceIntake
        mode={mode}
        file={file}
        text={text}
        busy={busy}
        compact={compact}
        samples={samples}
        acceptedFileTypes={acceptedFileTypes}
        tab={tab}
        onTab={switchTab}
        onFile={handleFile}
        onSample={useSampleDocument}
        onText={changeText}
      />

      {error && <p className="field-error" role="alert"><X size={15} aria-hidden="true" />{error}</p>}

      {compact && note}

      {compact ? (
        <>
          {submit}
          <HumanVerification ref={verification} compact={compact} onToken={setToken} onError={setError} />
        </>
      ) : (
        <>
          <HumanVerification ref={verification} compact={compact} onToken={setToken} onError={setError} />
          {submit}
        </>
      )}
      <input id="turnstile-token" aria-label="Human verification token" type="hidden" value={token} onChange={(event) => setToken(event.target.value)} />
      {!compact && <p className="review-note">Automated detection can miss personal information. Review the output before use in your practice.</p>}
    </form>
  )
}
