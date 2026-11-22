// @vitest-environment jsdom
import { useState } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { HandlingPanel, type Panel } from "@/components/HandlingPanel"
import { HandlingContext, type Choice } from "@/lib/handlingContext"
import { CATALOG, type Workflow, type WorkflowHandling } from "@/lib/workflows"

afterEach(cleanup)

function Harness({ workflowId, handling }: { workflowId: Parameters<typeof getWorkflow>[0]; handling?: WorkflowHandling }) {
  const [panel, setPanel] = useState<Panel>("guide")
  const [selected, setSelected] = useState<Choice | null>(handling?.default ?? null)
  const [submissionPending, setSubmissionPending] = useState(false)
  const workflow = { ...CATALOG.find((w) => w.id === workflowId)!, handling } as Workflow
  return (
    <HandlingContext.Provider value={{ selected, setSelected, submitted: selected ?? undefined, runPrepared: false, submissionPending, freezeRun: () => {}, beginSubmission: () => setSubmissionPending(true), cancelSubmission: () => setSubmissionPending(false), clearRun: () => setSubmissionPending(false), validateIntake: async () => ({ valid: true }) }}>
      <button onClick={() => setSubmissionPending(true)}>Begin pending submission</button>
      <HandlingPanel workflow={workflow} panel={panel} onPanelChange={setPanel} />
    </HandlingContext.Provider>
  )
}

const selectable: WorkflowHandling = { capability: "selectable", choices: ["reject", "redact"], default: "redact" }

describe("handling panel", () => {
  it("provides trust information for every active workflow", () => {
    for (const workflow of CATALOG.filter((item) => !item.disabled)) {
      render(<Harness workflowId={workflow.id} />)
      expect(screen.getByRole("region", { name: "Trust centre" })).toBeVisible()
      cleanup()
    }
  })

  it("keeps workflow trust information visible on both tabs", async () => {
    const user = userEvent.setup()
    render(<Harness workflowId="hr-hiring" handling={selectable} />)
    const trust = screen.getByRole("region", { name: "Trust centre" })
    expect(trust).toHaveTextContent("Synthetic or sanitised only")
    await user.click(screen.getByRole("tab", { name: "Options" }))
    expect(trust).toBeVisible()
    expect(trust).toHaveTextContent("Synthetic or sanitised only")
  })
  it("supports roving keyboard tabs and stable tabpanel relationships", async () => {
    const user = userEvent.setup()
    render(<Harness workflowId="transaction-review" handling={selectable} />)

    const options = screen.getByRole("tab", { name: "Options" })
    const guide = screen.getByRole("tab", { name: /Guide/ })
    expect(options.getAttribute("aria-controls")).toBe("handling-panel-options")
    expect(guide.getAttribute("aria-controls")).toBe("handling-panel-guide")
    expect(document.getElementById("handling-panel-options")?.hidden).toBe(true)

    guide.focus()
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toBe(options)
    expect(options.getAttribute("aria-selected")).toBe("true")
    expect(document.getElementById("handling-panel-guide")?.hidden).toBe(true)

    await user.keyboard("{Home}")
    expect(document.activeElement).toBe(guide)
  })

  it("renders the backend choices with the default checked and lets the user change it", async () => {
    const user = userEvent.setup()
    render(<Harness workflowId="transaction-review" handling={selectable} />)
    await user.click(screen.getByRole("tab", { name: "Options" }))

    const redact = screen.getByRole("radio", { name: /Redact/ }) as HTMLInputElement
    const reject = screen.getByRole("radio", { name: /Reject/ }) as HTMLInputElement
    expect(screen.queryByRole("radio", { name: /Off/ })).toBeNull()
    expect(redact.checked).toBe(true)
    expect(screen.getByText("Replace detected personal information with placeholders before processing.")).toBeTruthy()
    await user.click(reject)
    expect(reject.checked).toBe(true)
  })

  it("warns when the unscreened option is selected", async () => {
    const user = userEvent.setup()
    render(<Harness workflowId="transaction-review" handling={{ capability: "selectable", choices: ["reject", "redact", "off"], default: "redact" }} />)
    await user.click(screen.getByRole("tab", { name: "Options" }))
    expect(screen.queryByRole("note")).toBeNull()
    await user.click(screen.getByRole("radio", { name: /Off/ }))
    expect(screen.getByRole("note").textContent).toMatch(/Personal information may remain in the material processed by this tool\./)
    expect(screen.getByRole("radio", { name: /Off/ }).getAttribute("aria-describedby")).toBeTruthy()
  })

  it("locks the selected Off mode while submission is pending and keeps its warning", async () => {
    const user = userEvent.setup()
    render(<Harness workflowId="transaction-review" handling={{ capability: "selectable", choices: ["redact", "off"], default: "redact" }} />)
    await user.click(screen.getByRole("tab", { name: "Options" }))
    await user.click(screen.getByRole("radio", { name: /Off/ }))
    await user.click(screen.getByRole("button", { name: "Begin pending submission" }))
    expect(screen.getByRole("radio", { name: /Off/ })).toBeDisabled()
    expect(screen.getByRole("note").textContent).toMatch(/Personal information may remain/)
  })

  it("labels pseudonymise without changing its British-spelled wire value", async () => {
    const user = userEvent.setup()
    render(<Harness workflowId="transaction-review" handling={{ capability: "selectable", choices: ["pseudonymise"], default: "pseudonymise" }} />)
    await user.click(screen.getByRole("tab", { name: "Options" }))
    expect((screen.getByRole("radio", { name: /Pseudonymize/ }) as HTMLInputElement).value).toBe("pseudonymise")
    expect(screen.queryByRole("radio", { name: /pseudonymise/i })).toBeNull()
  })

  it("collapses the Options tab for fixed or unknown handling", () => {
    render(<Harness workflowId="transaction-review" handling={{ capability: "fixed", choices: ["redact"], default: "redact" }} />)
    expect(screen.queryByRole("tab", { name: "Options" })).toBeNull()
    cleanup()
    render(<Harness workflowId="transaction-review" />)
    expect(screen.queryByRole("tab", { name: "Options" })).toBeNull()
  })

  it("explains fixed handling in Guide and avoids claiming a source was never submitted", () => {
    const workflow = { ...CATALOG.find((w) => w.id === "transaction-review")!, handling: { capability: "fixed", choices: ["redact"], default: "redact" } } as Workflow
    const onPanelChange = () => {}
    const { rerender } = render(<HandlingPanel workflow={workflow} panel="guide" onPanelChange={onPanelChange} handlingStatus="ready" />)
    expect(screen.getByText(/backend confirms personal information handling is fixed at Redact/i)).toBeTruthy()
    expect(screen.getByText(/replacing a source clears current work/i)).toBeTruthy()
    expect(screen.queryByText(/original source is not kept|cannot restore a prior upload/i)).toBeNull()
    const selectableWorkflow = { ...workflow, handling: selectable } as Workflow
    rerender(<HandlingPanel workflow={selectableWorkflow} panel="guide" onPanelChange={onPanelChange} handlingStatus="unavailable" />)
    expect(screen.getByText(/Paste the text of an Ontario agreement/i)).toBeTruthy()
    rerender(<HandlingPanel workflow={selectableWorkflow} panel="options" onPanelChange={onPanelChange} handlingStatus="unavailable" />)
    expect(screen.getByText(/Reload before submitting another source/i)).toBeTruthy()
    expect(screen.queryByText(/Your source has not been submitted/i)).toBeNull()
  })

  it.each([
    ["checking", /backend confirmation is still pending/i],
    ["unavailable", /backend confirmation is unavailable/i],
  ] as const)("does not claim backend confirmation while capability status is %s", (handlingStatus, expected) => {
    const workflow = { ...CATALOG.find((w) => w.id === "transaction-review")!, handling: { capability: "fixed", choices: ["redact"], default: "redact" } } as Workflow
    render(<HandlingPanel workflow={workflow} panel="guide" onPanelChange={() => {}} handlingStatus={handlingStatus} />)
    expect(screen.getByText(expected)).toBeTruthy()
    expect(screen.queryByText(/backend confirms personal information handling is fixed/i)).toBeNull()
  })

  it("shows disabled workflows as launching soon without empty options", () => {
    render(<Harness workflowId="case-analysis" />)

    expect(screen.getByText("This workflow is not available yet.")).toBeTruthy()
    expect(screen.queryByRole("tab", { name: "Options" })).toBeNull()
    expect(screen.queryByText(/Redaction is always on/)).toBeNull()
  })
})
