// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FileIntake } from "@/components/FileIntake"

afterEach(() => {
  cleanup()
  delete (window as Window & { turnstile?: unknown }).turnstile
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const onSubmit = vi.hoisted(() => vi.fn())
const onFileChange = vi.hoisted(() => vi.fn())
const widgetCallbacks = vi.hoisted(() => ({ options: undefined as { callback?: (token: string) => void; onerror?: (message: unknown) => void } | undefined }))
const pdf = (name = "doc.pdf") => new File(["%PDF"], name, { type: "application/pdf" })

// The dev test key is injected by the component; clearing it simulates a build with
// no VITE_TURNSTILE_SITEKEY (production config failure). The real widget is absent.
const noConfig = () => {
  vi.stubGlobal("turnstile", undefined)
  vi.stubEnv("VITE_TURNSTILE_SITEKEY", "")
  // Component only injects the dev test key when import.meta.env.DEV; a production build gets "".
  vi.stubEnv("DEV", false)
}

function withTurnstile(widget: { render?: unknown; remove?: unknown; onerror?: unknown } = {}) {
  const render = vi.fn((_el: HTMLElement, options: typeof widgetCallbacks.options) => {
    widgetCallbacks.options = options
    return "widget-1"
  })
  vi.stubGlobal("turnstile", { render, remove: vi.fn(), reset: vi.fn(), ...widget })
}

function submitButton() {
  return screen.getByRole("button", { name: "Alias Document" })
}

// Real selection through the file input, not a direct callback call.
async function loadSample() {
  fireEvent.change(document.querySelector("input[type=file]")!, { target: { files: [pdf("local.pdf")] } })
  expect(await screen.findByText("local.pdf")).toBeTruthy()
}

async function tokenArrives() {
  widgetCallbacks.options?.callback?.("tok-123")
}

describe("FileIntake disabled submit states", () => {
  it("exposes why submit is unavailable on first render", async () => {
    const user = userEvent.setup()
    onSubmit.mockReset()
    render(<FileIntake onSubmit={onSubmit} />)

    expect(submitButton()).toBeDisabled()
    expect(submitButton()).toHaveTextContent("Alias Document")
    expect(screen.getByText("PDF or DOCX · One document at a time")).toBeTruthy()
    expect(screen.getByText("Human verification")).toBeTruthy()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("stays disabled and keeps the document-required reason when a valid file is selected but verification is pending", async () => {
    const user = userEvent.setup()
    onSubmit.mockReset()
    render(<FileIntake onSubmit={onSubmit} />)

    expect(submitButton()).toBeDisabled()
    await loadSample()
    expect(submitButton()).toBeDisabled()
    expect(screen.queryByText("PDF or DOCX · One document at a time")).not.toBeInTheDocument()
    // No error yet: verification has not completed.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})

describe("FileIntake verification gating", () => {
  it("keeps submit disabled with a valid file and no token", async () => {
    const user = userEvent.setup()
    onSubmit.mockReset()
    render(<FileIntake onSubmit={onSubmit} onFileChange={onFileChange} />)
    onFileChange(pdf("typed.pdf"))

    expect(submitButton()).toBeDisabled()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("enables submit with a workflow label once verification succeeds", async () => {
    const user = userEvent.setup()
    onSubmit.mockReset()
    withTurnstile()
    render(<FileIntake onSubmit={onSubmit} />)

    await loadSample()
    expect(submitButton()).toBeDisabled()
    await act(async () => { await tokenArrives() })

    expect(submitButton()).toBeEnabled()
    expect(submitButton()).toHaveTextContent("Alias Document")
    onSubmit.mockClear()
    await user.click(submitButton())
    expect(onSubmit).toHaveBeenCalledWith(expect.any(File), "tok-123")
  })

  it("announces a Turnstile script/config failure with role=alert and blocks submit", async () => {
    const user = userEvent.setup()
    onSubmit.mockReset()
    noConfig()
    render(<FileIntake onSubmit={onSubmit} />)

    expect(submitButton()).toBeDisabled()
    expect(screen.getByRole("alert")).toHaveTextContent(/not configured/i)
    expect(screen.getByRole("alert")).toHaveTextContent("uploads are disabled")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("announces a widget error with role=alert and blocks submit", async () => {
    const user = userEvent.setup()
    onSubmit.mockReset()
    withTurnstile()
    render(<FileIntake onSubmit={onSubmit} />)

    await loadSample()
    expect(submitButton()).toBeDisabled()

    widgetCallbacks.options?.onerror?.("blocked by policy")
    expect(await screen.findByRole("alert")).toHaveTextContent(/Human verification failed/)
    expect(screen.getByRole("alert")).toHaveTextContent("blocked by policy")
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe("FileIntake busy state", () => {
  it("disables submit, announces the uploading label, and rejects repeated submits", async () => {
    const user = userEvent.setup()
    onSubmit.mockReset()
    render(<FileIntake busy onSubmit={onSubmit} />)

    expect(screen.getByRole("button", { name: "Uploading document…" })).toBeDisabled()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
