import { MODE_LABELS } from "@/lib/inputModes"
import type { InputMode } from "@/lib/workflows"

export type MultiFileIntakeProps = {
  // Ordered modes to offer; the owner only renders this for multi-mode surfaces.
  modes: readonly InputMode[]
  mode: InputMode
  busy: boolean
  onMode: (mode: InputMode) => void
}

// Native radio group so keyboard and screen-reader semantics come from the browser.
export function MultiFileIntake({ modes, mode, busy, onMode }: MultiFileIntakeProps) {
  return (
    <fieldset className="input-mode-group">
      <legend>Input method</legend>
      {modes.map((option) => (
        <label key={option} className="input-mode-option">
          <input type="radio" name="input-mode" value={option} checked={mode === option} disabled={busy} onChange={() => onMode(option)} />
          {MODE_LABELS[option]}
        </label>
      ))}
    </fieldset>
  )
}
