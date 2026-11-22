import { FileDropzone } from '@/components/intake/FileDropzone'
import { MultiFileIntake } from '@/components/intake/MultiFileIntake'
import { TextIntake } from '@/components/intake/TextIntake'
import type { InputMode } from '@/lib/workflows'

type Props = {
  modes: readonly InputMode[]
  mode: 'file' | 'text'
  onMode: (mode: 'file' | 'text') => void
  file: File | null
  onFile: (file: File | undefined) => void
  text: string
  onText: (text: string) => void
  busy: boolean
  acceptedFileTypes: readonly string[]
}

export function SessionSourceIntake({ modes, mode, onMode, file, onFile, text, onText, busy, acceptedFileTypes }: Props) {
  const available = modes.filter((m): m is 'file' | 'text' => m === 'file' || m === 'text')
  if (!available.length) return <p role="alert">This workflow needs an update before a source can be submitted.</p>
  const active = available.includes(mode) ? mode : available[0]
  return <>
    {available.length > 1 && <MultiFileIntake modes={available} mode={active} busy={busy} onMode={(next) => { if (next === 'file' || next === 'text') onMode(next) }} />}
    {active === 'file' ? <FileDropzone inputLabel="Upload PDF" file={file} onFile={onFile} busy={busy} compact={false} acceptedFileTypes={acceptedFileTypes} /> : <TextIntake id="session-source-text" label="Paste source text" text={text} onText={onText} busy={busy} />}
  </>
}
