// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { FileDropzone } from "@/components/intake/FileDropzone"
import { MultiFileIntake } from "@/components/intake/MultiFileIntake"
import { TextIntake } from "@/components/intake/TextIntake"
import { HumanVerification, type HumanVerificationHandle } from "@/components/intake/HumanVerification"

afterEach(() => {
  cleanup()
  delete (window as Window & { turnstile?: unknown }).turnstile
})

describe("FileDropzone", () => {
  it("reports the picked file without validating it", () => {
    const onFile = vi.fn()
    const { container } = render(<FileDropzone file={null} busy={false} compact={false} onFile={onFile} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toBe(".pdf,.docx")

    const file = new File(["x"], "note.txt", { type: "text/plain" })
    fireEvent.change(input, { target: { files: [file] } })

    expect(onFile).toHaveBeenCalledWith(file)
  })

  it("uses JSON accept and copy when json is set", () => {
    const { container } = render(<FileDropzone file={null} json busy={false} compact={false} onFile={vi.fn()} />)
    expect((container.querySelector('input[type="file"]') as HTMLInputElement).accept).toBe(".json,application/json")
    expect(screen.getByText("Drop your JSON file here")).toBeTruthy()
  })

  it("ignores drops while busy", () => {
    const onFile = vi.fn()
    const { container } = render(<FileDropzone file={null} busy compact onFile={onFile} />)
    const dropzone = container.querySelector("label.dropzone") as HTMLLabelElement
    fireEvent.drop(dropzone, { dataTransfer: { files: [new File(["x"], "a.pdf")] } })
    expect(onFile).not.toHaveBeenCalled()
  })

  it("ignores drag entry while busy and clears dragging when busy turns on", () => {
    const { container, rerender } = render(<FileDropzone file={null} busy={false} compact onFile={vi.fn()} />)
    const dropzone = container.querySelector("label.dropzone") as HTMLLabelElement
    fireEvent.dragEnter(dropzone)
    expect(dropzone.classList.contains("is-dragging")).toBe(true)

    rerender(<FileDropzone file={null} busy compact onFile={vi.fn()} />)
    expect(dropzone.classList.contains("is-dragging")).toBe(false)

    fireEvent.dragEnter(dropzone)
    expect(dropzone.classList.contains("is-dragging")).toBe(false)
  })

  it("re-reports the same file on reselection by clearing the input value", () => {
    const onFile = vi.fn()
    const { container } = render(<FileDropzone file={null} busy={false} compact={false} onFile={onFile} />)
    const input = container.querySelector("input[type=file]") as HTMLInputElement
    const file = new File(["x"], "note.pdf", { type: "application/pdf" })

    fireEvent.change(input, { target: { files: [file] } })
    expect(input.value).toBe("")
    fireEvent.change(input, { target: { files: [file] } })

    expect(onFile).toHaveBeenCalledTimes(2)
    expect(onFile).toHaveBeenNthCalledWith(2, file)
  })

  it("gives each instance a unique input id wired to its label", () => {
    const { container } = render(
      <>
        <FileDropzone file={null} busy={false} compact={false} onFile={vi.fn()} />
        <FileDropzone file={null} json busy={false} compact={false} onFile={vi.fn()} />
      </>,
    )
    const inputs = Array.from(container.querySelectorAll("input[type=file]")) as HTMLInputElement[]
    const labels = Array.from(container.querySelectorAll("label.dropzone")) as HTMLLabelElement[]
    expect(inputs[0].id).not.toBe("")
    expect(inputs[0].id).not.toBe(inputs[1].id)
    expect(labels.map((label) => label.htmlFor)).toEqual([inputs[0].id, inputs[1].id])
    expect(inputs[1].accept).toBe(".json,application/json")
  })
})

describe("MultiFileIntake", () => {
  it("renders native radios and reports the chosen mode", () => {
    const onMode = vi.fn()
    render(<MultiFileIntake modes={["file", "text"]} mode="file" busy={false} onMode={onMode} />)

    const radios = screen.getAllByRole("radio") as HTMLInputElement[]
    expect(radios.map((r) => r.value)).toEqual(["file", "text"])
    expect(radios[0].checked).toBe(true)
    expect(screen.getByRole("group", { name: "Input method" })).toBeTruthy()

    fireEvent.click(radios[1])
    expect(onMode).toHaveBeenCalledWith("text")
  })
})

describe("TextIntake", () => {
  it("wires the label, textarea and byte meta by id", () => {
    render(<TextIntake id="pasted-text" label="Document text" text="héllo" busy={false} onText={vi.fn()} />)
    const textarea = screen.getByLabelText("Document text") as HTMLTextAreaElement
    expect(textarea.id).toBe("pasted-text")
    expect(textarea.getAttribute("aria-describedby")).toBe("pasted-text-bytes")
    expect(document.getElementById("pasted-text-bytes")?.textContent).toContain("6 of 10,485,760 bytes")
  })

  it("reports edits and disables while busy", () => {
    const onText = vi.fn()
    const { rerender } = render(<TextIntake id="pasted-json" label="Or paste JSON" text="" busy={false} onText={onText} />)
    fireEvent.change(screen.getByLabelText("Or paste JSON"), { target: { value: "{}" } })
    expect(onText).toHaveBeenCalledWith("{}")

    rerender(<TextIntake id="pasted-json" label="Or paste JSON" text="" busy onText={onText} />)
    expect((screen.getByLabelText("Or paste JSON") as HTMLTextAreaElement).disabled).toBe(true)
  })
})

describe("HumanVerification", () => {
  const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js"

  it("renders the widget and reports the token through the callback", () => {
    let captured: { callback: (t: string) => void } | undefined
    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: {
        render: vi.fn((_el: HTMLElement, o: { callback: (t: string) => void }) => { captured = o; return "w-1" }),
        remove: vi.fn(),
      },
    })
    const onToken = vi.fn()
    render(<HumanVerification compact={false} onToken={onToken} onError={vi.fn()} />)

    captured!.callback("tok-1")
    expect(onToken).toHaveBeenCalledWith("tok-1")
  })

  it("reports the configuration error through onError when no sitekey is set", () => {
    const onError = vi.fn()
    const prev = import.meta.env.VITE_TURNSTILE_SITEKEY
    const dev = import.meta.env.DEV
    import.meta.env.VITE_TURNSTILE_SITEKEY = ""
    ;(import.meta.env as { DEV: boolean }).DEV = false
    try {
      render(<HumanVerification compact onToken={vi.fn()} onError={onError} />)
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("Human verification is not configured"))
    } finally {
      import.meta.env.VITE_TURNSTILE_SITEKEY = prev
      ;(import.meta.env as { DEV: boolean }).DEV = dev
    }
  })

  it("reset() calls turnstile.reset with the live widget id and swallows reset errors", () => {
    const reset = vi.fn(() => { throw new Error("boom") })
    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: { render: vi.fn(() => "w-9"), remove: vi.fn(), reset },
    })
    const ref = createRef<HumanVerificationHandle>()
    render(<HumanVerification ref={ref} compact={false} onToken={vi.fn()} onError={vi.fn()} />)

    expect(() => ref.current!.reset()).not.toThrow()
    expect(reset).toHaveBeenCalledWith("w-9")
  })

  it("removes its widget and script listeners on unmount", () => {
    const remove = vi.fn()
    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: { render: vi.fn(() => "w-7"), remove, reset: vi.fn() },
    })
    const { unmount } = render(<HumanVerification compact onToken={vi.fn()} onError={vi.fn()} />)
    unmount()
    expect(remove).toHaveBeenCalledWith("w-7")
    expect(document.querySelector(`script[src="${SRC}"]`)).toBeNull()
  })
})
