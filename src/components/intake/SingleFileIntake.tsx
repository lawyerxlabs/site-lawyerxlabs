import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileDropzone, formatSize } from "@/components/intake/FileDropzone"

export type SampleDocument = { label: string; url: string; filename: string }

export type SingleFileIntakeProps = {
  file: File | null
  busy: boolean
  compact: boolean
  samples: readonly SampleDocument[]
  acceptedFileTypes: readonly string[]
  tab: "upload" | "sample"
  onTab: (tab: "upload" | "sample") => void
  onFile: (file: File | undefined) => void
  onSample: (sample: SampleDocument) => void
}

// Upload / sample tabs when samples exist; otherwise the bare dropzone.
export function SingleFileIntake({ file, busy, compact, samples, acceptedFileTypes, tab, onTab, onFile, onSample }: SingleFileIntakeProps) {
  const dropzone = <FileDropzone file={file} busy={busy} compact={compact} acceptedFileTypes={acceptedFileTypes} onFile={onFile} />
  if (samples.length === 0) return dropzone
  return (
    <Tabs value={tab} onValueChange={(value) => onTab(value as "upload" | "sample")}>
      <TabsList aria-label="Document source">
        <TabsTrigger value="upload" disabled={busy}>Upload document</TabsTrigger>
        <TabsTrigger value="sample" disabled={busy}>Try a sample</TabsTrigger>
      </TabsList>
      <TabsContent value="upload">{dropzone}</TabsContent>
      <TabsContent value="sample">
        <div className="sample-list">
          {samples.map((sample, index) => (
            <button key={index} type="button" className="sample-link" disabled={busy} onClick={() => onSample(sample)}>
              {sample.label}
            </button>
          ))}
        </div>
        {file && <p className="sample-selected"><strong>{file.name}</strong> · {formatSize(file.size)} · Ready to process</p>}
      </TabsContent>
    </Tabs>
  )
}
