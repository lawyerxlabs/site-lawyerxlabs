import type { InputMode } from "@/lib/workflows"
import { FileDropzone } from "@/components/intake/FileDropzone"
import { SingleFileIntake, type SampleDocument } from "@/components/intake/SingleFileIntake"
import { TextIntake } from "@/components/intake/TextIntake"

export type SourceIntakeProps = {
  mode: InputMode
  file: File | null
  text: string
  busy: boolean
  compact: boolean
  samples: readonly SampleDocument[]
  acceptedFileTypes: readonly string[]
  tab: "upload" | "sample"
  onTab: (tab: "upload" | "sample") => void
  onFile: (file: File | undefined) => void
  onSample: (sample: SampleDocument) => void
  onText: (text: string) => void
}

// Picks the body for the active input mode; the owner keeps every state transition.
export function SourceIntake({ mode, file, text, busy, compact, samples, acceptedFileTypes, tab, onTab, onFile, onSample, onText }: SourceIntakeProps) {
  if (mode === "text") return <TextIntake id="pasted-text" label="Document text" text={text} busy={busy} onText={onText} />
  if (mode === "json") {
    return (
      <>
        <FileDropzone file={file} json busy={busy} compact={compact} onFile={onFile} />
        <TextIntake id="pasted-json" label="Or paste JSON" text={text} busy={busy} onText={onText} />
      </>
    )
  }
  return <SingleFileIntake file={file} busy={busy} compact={compact} samples={samples} acceptedFileTypes={acceptedFileTypes} tab={tab} onTab={onTab} onFile={onFile} onSample={onSample} />
}
