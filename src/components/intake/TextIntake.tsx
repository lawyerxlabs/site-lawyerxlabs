import { MAX_UPLOAD_BYTES, utf8ByteLength } from "@/lib/inputModes"

export type TextIntakeProps = {
  // Owns both the DOM id and the label; the byte meta id is derived from it.
  id: string
  label: string
  text: string
  busy: boolean
  onText: (text: string) => void
}

// Paste panel for text and JSON modes; the owner decides what the pasted text becomes.
export function TextIntake({ id, label, text, busy, onText }: TextIntakeProps) {
  const metaId = `${id}-bytes`
  return (
    <>
      <label htmlFor={id} className="input-mode-label">{label}</label>
      <textarea id={id} className="input-mode-textarea" value={text} disabled={busy} aria-describedby={metaId} onChange={(event) => onText(event.target.value)} />
      <p id={metaId} className="input-mode-meta">{`${utf8ByteLength(text).toLocaleString()} of ${MAX_UPLOAD_BYTES.toLocaleString()} bytes (10 MiB limit)`}</p>
    </>
  )
}
