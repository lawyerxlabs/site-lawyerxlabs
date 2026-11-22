import { createContext, useContext } from "react"

export type Choice = "reject" | "redact" | "off" | "pseudonymise"

type HandlingState = {
  // Value shown as checked in the Options tab (user pick, else backend default).
  selected: Choice | null
  setSelected: (choice: Choice) => void
  runPrepared: boolean
  submissionPending: boolean
  // Value to submit as workflow_settings.handling. undefined unless the workflow is selectable:
  // the backend rejects a handling value for fixed/none workflows.
  submitted: Choice | undefined
  freezeRun: (choice?: Choice) => void
  beginSubmission: (choice?: Choice) => void
  cancelSubmission: () => void
  clearRun: () => void
  validateIntake: () => Promise<{ valid: boolean; submitted?: Choice }>
}

export const HandlingContext = createContext<HandlingState>({ selected: null, setSelected: () => {}, runPrepared: false, submissionPending: false, submitted: undefined, freezeRun: () => {}, beginSubmission: () => {}, cancelSubmission: () => {}, clearRun: () => {}, validateIntake: async () => ({ valid: true }) })

export const useHandlingContext = () => useContext(HandlingContext)
