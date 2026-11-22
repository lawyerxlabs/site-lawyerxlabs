import { useId, useState, type DragEvent } from "react"
import { UploadCloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatSize } from "@/components/intake/FileDropzone"
import { listFileTypes } from "@/lib/inputModes"

type Props = { files: File[]; onFiles: (files: File[]) => void; busy: boolean; acceptedFileTypes: readonly string[] }

export function MultiDocumentIntake({ files, onFiles, busy, acceptedFileTypes }: Props) {
  const id = useId()
  const [dragging, setDragging] = useState(false)
  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault(); setDragging(false)
    if (!busy) onFiles(Array.from(event.dataTransfer.files))
  }
  return <>
    <label htmlFor={id} className={`dropzone${dragging ? " is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragging(true) }}
      onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}>
      <input id={id} aria-label="Upload source documents" type="file" multiple accept={acceptedFileTypes.join(",")} disabled={busy || !acceptedFileTypes.length} onChange={(event) => { onFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = "" }} />
      <span className="upload-icon" aria-hidden="true"><UploadCloud size={27} /></span>
      <span className="drop-title">Drop your documents here</span>
      <span className="drop-help">or <span className="browse-file">Choose files</span></span>
      <span className="drop-meta">{listFileTypes(acceptedFileTypes)} · Up to 5 files</span>
    </label>
    <p aria-live="polite">{files.length} of 5 files selected</p>
    {files.length > 0 && <ul className="intake-file-list">{files.map((file, index) => <li key={`${file.name}-${index}`}><span>{file.name} · {formatSize(file.size)}</span>{" "}<Button type="button" variant="ghost" disabled={busy} aria-label={`Remove ${file.name}`} onClick={() => onFiles(files.filter((_, i) => i !== index))}>Remove</Button></li>)}</ul>}
  </>
}
