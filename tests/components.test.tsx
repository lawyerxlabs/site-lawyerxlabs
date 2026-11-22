// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog"

afterEach(cleanup)

// ------------------------------------------------------------------
// Tabs
// ------------------------------------------------------------------

function ControlledTabs() {
  const [tab, setTab] = useState("a")
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="Test tabs">
        <TabsTrigger value="a">Alpha</TabsTrigger>
        <TabsTrigger value="b">Beta</TabsTrigger>
        <TabsTrigger value="c">Gamma</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panel A</TabsContent>
      <TabsContent value="b">Panel B</TabsContent>
      <TabsContent value="c">Panel C</TabsContent>
    </Tabs>
  )
}

describe("Tabs", () => {
  it("renders the initial tab panel", () => {
    render(<ControlledTabs />)
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel A")
    expect(screen.queryByText("Panel B")).toBeNull()
  })

  it("clicking a tab switches the panel", async () => {
    const user = userEvent.setup()
    render(<ControlledTabs />)
    await user.click(screen.getByRole("tab", { name: "Beta" }))
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel B")
  })

  it("selected tab has aria-selected=true, others false", async () => {
    const user = userEvent.setup()
    render(<ControlledTabs />)
    await user.click(screen.getByRole("tab", { name: "Beta" }))
    expect(screen.getByRole("tab", { name: "Beta" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tab", { name: "Alpha" }).getAttribute("aria-selected")).toBe("false")
  })

  it("ArrowRight moves focus to the next tab", async () => {
    const user = userEvent.setup()
    render(<ControlledTabs />)
    const alpha = screen.getByRole("tab", { name: "Alpha" })
    const beta = screen.getByRole("tab", { name: "Beta" })
    alpha.focus()
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toBe(beta)
  })

  it("ArrowLeft wraps focus to the last tab", async () => {
    const user = userEvent.setup()
    render(<ControlledTabs />)
    const alpha = screen.getByRole("tab", { name: "Alpha" })
    const gamma = screen.getByRole("tab", { name: "Gamma" })
    alpha.focus()
    await user.keyboard("{ArrowLeft}")
    expect(document.activeElement).toBe(gamma)
  })

  it("ArrowRight wraps focus from last to first tab", async () => {
    const user = userEvent.setup()
    render(<ControlledTabs />)
    const alpha = screen.getByRole("tab", { name: "Alpha" })
    const gamma = screen.getByRole("tab", { name: "Gamma" })
    gamma.focus()
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toBe(alpha)
  })

  it("Home focuses the first tab", async () => {
    const user = userEvent.setup()
    render(<ControlledTabs />)
    const beta = screen.getByRole("tab", { name: "Beta" })
    const alpha = screen.getByRole("tab", { name: "Alpha" })
    beta.focus()
    await user.keyboard("{Home}")
    expect(document.activeElement).toBe(alpha)
  })

  it("End focuses the last tab", async () => {
    const user = userEvent.setup()
    render(<ControlledTabs />)
    const beta = screen.getByRole("tab", { name: "Beta" })
    const gamma = screen.getByRole("tab", { name: "Gamma" })
    beta.focus()
    await user.keyboard("{End}")
    expect(document.activeElement).toBe(gamma)
  })

  it("exposes the active tab through aria-selected", () => {
    render(<ControlledTabs />)
    expect(screen.getByRole("tab", { name: "Alpha" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tab", { name: "Beta" }).getAttribute("aria-selected")).toBe("false")
  })
})

// ------------------------------------------------------------------
// AlertDialog
// ------------------------------------------------------------------

function DeleteDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <AlertDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete this output?</AlertDialogTitle>
        <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
        <div className="ll-alert-actions">
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setOpen(false); onConfirm() }}>Delete output</AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

describe("AlertDialog", () => {
  it("renders labelled content when open", () => {
    render(<DeleteDialog onConfirm={vi.fn()} onCancel={vi.fn()} />)
    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy()
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy()
  })

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<DeleteDialog onConfirm={onConfirm} onCancel={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Delete output" }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<DeleteDialog onConfirm={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByRole("button", { name: "Keep it" }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("focuses the safe cancel action first so Enter cannot confirm deletion by default", () => {
    render(<DeleteDialog onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep it" }))
  })

  it("Escape dismisses without confirming", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<DeleteDialog onConfirm={onConfirm} onCancel={onCancel} />)
    await user.keyboard("{Escape}")
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })
})
