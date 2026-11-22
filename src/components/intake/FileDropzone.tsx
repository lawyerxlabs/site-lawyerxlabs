import { useEffect, useId, useState, type DragEvent } from "react"
import { FileText, RefreshCw, UploadCloud } from "lucide-react"
import { DEFAULT_FILE_TYPES, listFileTypes } from "@/lib/inputModes"

export type FileDropzoneProps = {
  file: File | null
  inputLabel?: string
  // JSON copy and accept list; otherwise PDF/DOCX copy.
  json?: boolean
  // Backend file extensions for the accept attr and copy. Default keeps the PDF/DOCX wording.
  acceptedFileTypes?: readonly string[]
  busy: boolean
  compact: boolean
  // Owner validates and stores the pick; the dropzone only reports it.
  onFile: (file: File | undefined) => void
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileDropzone({ file, inputLabel, json = false, acceptedFileTypes = DEFAULT_FILE_TYPES, busy, compact, onFile }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputId = useId()
  const types = listFileTypes(acceptedFileTypes)

  useEffect(() => {
    if (busy) setDragging(false)
  }, [busy])

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    if (busy) return
    onFile(event.dataTransfer.files[0])
  }

  return (
    <label
      htmlFor={inputId}
      onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragging(true) }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`dropzone${dragging ? " is-dragging" : ""}${file ? " has-file" : ""}`}
    >
      <input id={inputId} aria-label={inputLabel} type="file" accept={json ? ".json,application/json" : acceptedFileTypes.join(",")} disabled={busy} onChange={(event) => { onFile(event.currentTarget.files?.[0]); event.currentTarget.value = "" }} />
      {file ? (
        <>
          <span className="file-icon" aria-hidden="true"><FileText size={25} /></span>
          <span className="file-details"><strong>{file.name}</strong><small>{formatSize(file.size)} · Ready to process</small></span>
          <span className="replace-file"><RefreshCw size={15} aria-hidden="true" /> Replace</span>
        </>
      ) : compact ? (
        <>
          <span className="upload-icon" aria-hidden="true"><UploadCloud size={20} /></span>
          <span className="drop-title">{json ? "Drop a JSON file here, or choose a file" : `Drop ${types} here, or choose a file`}</span>
        </>
      ) : (
        <>
          <span className="upload-icon" aria-hidden="true"><UploadCloud size={27} /></span>
          <span className="drop-title">{json ? "Drop your JSON file here" : "Drop your document here"}</span>
          <span className="drop-help">or <span className="browse-file">Choose a file</span></span>
          <span className="drop-meta">{json ? "JSON · One document at a time" : `${types} · One document at a time`}</span>
        </>
      )}
    </label>
  )
}
