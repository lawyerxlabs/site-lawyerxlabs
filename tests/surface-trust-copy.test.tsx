// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { Shell } from "@/components/Shell"

// Surface is selected at module load; these tests swap it per case through the mocked getter.
const state = vi.hoisted(() => ({ id: "lawyerlab" }))
vi.mock("@/surface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/surface")>()
  return {
    ...actual,
    get surface() {
      const selected = actual.SURFACES[state.id as keyof typeof actual.SURFACES]
      return { ...selected, copy: { ...selected.copy, trustTitle: `${selected.name} Trust Centre` } }
    },
  }
})

const tier = vi.hoisted(() => ({ signedIn: false, ready: true, identity: null as unknown, me: null as unknown, login: vi.fn(), logout: vi.fn(async () => {}) }))
vi.mock("@/lib/useTier", () => ({ useTier: () => tier }))

afterEach(cleanup)

async function openTrust() {
  render(<MemoryRouter initialEntries={["/playground/"]}><Shell><p>Content</p></Shell></MemoryRouter>)
  const title = `${state.id === "signal-lawyers" ? "Signal Lawyers" : "Human Resources Lab"} Trust Centre`
  const user = userEvent.setup()
  const opener = document.querySelector<HTMLButtonElement>(`aside.playground-sidebar .sidebar-bottom button[title="${title}"]`)
  expect(opener?.textContent).toContain(title)
  await user.click(opener!)
  return screen.findByRole("dialog", { name: title })
}

describe("surface trust copy", () => {
  it("shows Signal Lawyers trust statements without LawyerLab redaction claims", async () => {
    state.id = "signal-lawyers"
    const dialog = await openTrust()
    expect(dialog.textContent).toContain("Alias and agreement analysis can be used without signing in when available.")
    expect(dialog.textContent).toContain("Review before use")
    expect(dialog.textContent).toContain("does not provide legal advice")
    expect(dialog.textContent).not.toContain("Redaction")
    expect(dialog.textContent).not.toContain("rendered in your browser")
    expect(dialog.textContent).not.toContain("Personal information")
    const mark = document.querySelector<HTMLImageElement>("aside.playground-sidebar .brand-mark")!
    expect(mark.getAttribute("src")).toBe("/signal-logo-mark.svg")
  })

  it("shows HR statements that avoid LawyerLab claims", async () => {
    state.id = "human-resources"
    const dialog = await openTrust()
    expect(dialog.textContent).toContain("Human review required — Every output must be reviewed by a person before you use it.")
    expect(dialog.textContent).toContain("No legal or compliance assessment")
    expect(dialog.textContent).not.toContain("Redaction")
    expect(dialog.textContent).not.toContain("Personal information")
    expect(dialog.textContent).not.toContain("Anonymous results")
  })
})
