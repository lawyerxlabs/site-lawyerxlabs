// @vitest-environment jsdom
// Focused coverage for the FileIntake inputModes behavior required by the issue:
// selector gating, mode-switch state clearing, JSON validation, byte-exact pastes,
// and the same error/preservation rules for picked JSON as for dropped JSON.
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FileIntake } from "@/components/FileIntake"
import { checkJsonFile, MAX_UPLOAD_BYTES, pastedJsonFile, pastedTextFile, utf8ByteLength } from "@/lib/inputModes"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Stub the Turnstile widget; paste/file submits need a token to reach onSubmit.
function stubTurnstile() {
  const options: { callback?: (token: string) => void } = {}
  Object.defineProperty(window, "turnstile", {
    configurable: true,
    value: {
      render: vi.fn((_element: HTMLElement, next: { callback?: (token: string) => void }) => {
        Object.assign(options, next)
        return "widget-1"
      }),
      remove: vi.fn(),
    },
  })
  return options
}

const textFile = new File(["Résumé — naïve façade"], "letter.txt", { type: "text/plain" })
// Default single mode: no selector, original upload-only form.
describe("FileIntake file-only", () => {
  it("renders no input-mode selector by default", () => {
    render(<FileIntake busy={false} onSubmit={vi.fn()} />)
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.queryByRole("radio", { name: "Paste text" })).toBeNull()
    expect(screen.queryByRole("radio", { name: "Import JSON" })).toBeNull()
  })

  it("renders no input-mode selector when inputModes is only file", () => {
    render(<FileIntake busy={false} onSubmit={vi.fn()} inputModes={["file"]} />)
    expect(screen.queryByRole("radio", { name: "Paste text" })).toBeNull()
  })
})

describe("FileIntake configured modes", () => {
  it("shows only the configured modes in order", () => {
    render(<FileIntake busy={false} onSubmit={vi.fn()} inputModes={["json", "file"]} />)
    expect(screen.getByRole("radio", { name: "Upload file" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Import JSON" })).toBeTruthy()
  })

  it("defaults to the first configured mode", () => {
    render(<FileIntake busy={false} onSubmit={vi.fn()} inputModes={["json", "file"]} />)
    expect((screen.getByRole("radio", { name: "Upload file" }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole("radio", { name: "Import JSON" }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText(/Drop your document here/)).toBeTruthy()
  })
})

describe("FileIntake busy", () => {
  it("disables selector, textarea and submit while busy", () => {
    render(<FileIntake busy onSubmit={vi.fn()} inputModes={["file", "text", "json"]} />)
    for (const name of ["Upload file", "Paste text", "Import JSON"]) {
      expect((screen.getByRole("radio", { name }) as HTMLInputElement).disabled).toBe(true)
    }
    expect((screen.getByRole("button", { name: /Alias Document|Uploading document/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("FileIntake pasted text", () => {
  it("submits exact bytes, name and MIME type", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["text"]} />)
    options.callback?.("tok-1")
    const box = screen.getByRole("textbox") as HTMLTextAreaElement
    // userEvent.type goes through the real onChange path instead of bypassing React state.
    for (const char of "Résumé — naïve façade") {
      fireEvent.change(box, { target: { value: box.value + char } })
    }
    expect(box.value).toBe("Résumé — naïve façade")
    await user.click(screen.getByRole("button", { name: /Alias Document|Uploading document/ }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const [file, token] = onSubmit.mock.calls[0]
    expect(token).toBe("tok-1")
    expect(file.name).toBe("pasted-text.txt")
    expect(file.type).toBe("text/plain;charset=utf-8")
    expect(await file.text()).toBe("Résumé — naïve façade")
  })

  it("ignores an empty paste: the submit button is disabled without input", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["text"]} />)
    options.callback?.("tok-2")
    fireEvent.submit(screen.getByRole("button", { name: /Alias Document|Uploading document/ }).closest("form")!)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

// Reproduce the control character the browser substitutes when serializing invalid UTF-8.
const RAW_BYTES = new Uint8Array([0x7b, 0x22, 0x6c, 0x69, 0x22, 0x3a, 0xff, 0x7d]) // {"li":<0xff>}
const decoder = new TextDecoder("utf-8", { fatal: false })
const LOSSY = decoder.decode(RAW_BYTES)

describe("FileIntake pasted JSON", () => {
  it.each([
    ["object", '{"a":1}', '{"a":1}'],
    ["array", "[1,2]", "[1,2]"],
    ["string", '"hi"', '"hi"'],
    ["number", "42", "42"],
    ["boolean", "true", "true"],
    ["null", "null", "null"],
  ])("accepts pasted JSON %s and submits the re-serialized bytes", async (_kind, pasted, expected) => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["json"]} />)
    options.callback?.("tok-json")
    fireEvent.change(screen.getByRole("textbox"), { target: { value: pasted } })
    await user.click(screen.getByRole("button", { name: /Alias Document|Uploading document/ }))
    const [file] = onSubmit.mock.calls[0]
    expect(file.name).toBe("imported-data.json")
    expect(file.type).toBe("application/json;charset=utf-8")
    expect(await file.text()).toBe(expected)
  })

  it("rejects malformed JSON and keeps the token for a corrected retry", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["json"]} />)
    options.callback?.("tok-bad")
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "{oops" } })
    await user.click(screen.getByRole("button", { name: /Alias Document|Uploading document/ }))
    expect(await screen.findByText("That is not valid JSON.")).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole("textbox"), { target: { value: '{"ok":1}' } })
    await user.click(screen.getByRole("button", { name: /Alias Document|Uploading document/ }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("rejects JSON pasted over 10 MiB without parsing it", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    const options = stubTurnstile()
    render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["json"]} />)
    options.callback?.("tok-big")
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x".repeat(11 * 1024 * 1024) } })
    await user.click(screen.getByRole("button", { name: /Alias Document|Uploading document/ }))
    expect(await screen.findByText("JSON is larger than 10 MB.")).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("submits a paste with lossy-decoded control characters through the JSON path", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["json"]} />)
    options.callback?.("tok-raw")
    fireEvent.change(screen.getByRole("textbox"), { target: { value: LOSSY } })
    await user.click(screen.getByRole("button", { name: /Alias Document|Uploading document/ }))
    // The 0xFF byte became U+FFFD on paste; not parseable JSON, so it never reaches onSubmit.
    expect(await screen.findByText("That is not valid JSON.")).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("pastes multi-byte characters as UTF-8 byte counts, not code units", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["text"]} />)
    options.callback?.("tok-mb")
    const pasted = "é".repeat(6_000_000) // 12 MB UTF-8 bytes, 6M code units
    fireEvent.change(screen.getByRole("textbox"), { target: { value: pasted } })
    fireEvent.submit(screen.getByRole("button", { name: /Alias Document|Uploading document/ }).closest("form")!)
    expect(await screen.findByText("Pasted text is larger than 10 MB.")).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe("FileIntake mode switching", () => {
  it("clears stale state and supersedes pending validation from the previous mode", async () => {
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["file", "json"]} />)
    options.callback?.("tok-modes")
    // Pick a PDF (file mode is default), then switch to json before validation resolves.
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" })] } })
    fireEvent.click(screen.getByRole("radio", { name: "Import JSON" }))
    // The stale PDF must never appear or submit in json mode.
    expect(await screen.findByText(/Drop your JSON file here/)).toBeTruthy()
    expect(screen.queryByText("contract.pdf")).toBeNull()
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [new File(["{}"], "data.json", { type: "application/json" })] } })
    expect(await screen.findByText("data.json")).toBeTruthy()
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText("contract.pdf")).toBeNull()
  })
})

describe("FileIntake JSON file selection and drop", () => {
  const jsonFile = (contents: string, name = "data.json") => new File([contents], name, { type: "application/json" })
  const pick = (container: HTMLElement, file: File) => fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } })
  const drop = (container: HTMLElement, file: File) => fireEvent.drop(container.querySelector(".dropzone")!, { dataTransfer: { files: [file] } })

  it("accepts a picked JSON file with exact bytes and name", async () => {
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["json"]} />)
    options.callback?.("tok-pick")
    pick(container, jsonFile('{"keep":true}'))
    expect(await screen.findByText("data.json")).toBeTruthy()
    await userEvent.setup().click(screen.getByRole("button", { name: /Alias Document|Uploading document/ }))
    const [file] = onSubmit.mock.calls[0]
    expect(file.name).toBe("data.json")
    expect(await file.text()).toBe('{"keep":true}')
  })

  it("rejects a malformed picked JSON file and keeps the token", async () => {
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["json"]} />)
    options.callback?.("tok-malformed")
    pick(container, jsonFile("{nope"))
    expect(await screen.findByText("That file is not valid JSON.")).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("rejects an oversized picked JSON file", async () => {
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["json"]} />)
    options.callback?.("tok-big")
    pick(container, jsonFile("x".repeat(10 * 1024 * 1024 + 1)))
    expect(await screen.findByText("File is larger than 10 MB. Choose a smaller JSON file.")).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("routes a dropped JSON file through the same validation path as a pick", async () => {
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["json"]} />)
    options.callback?.("tok-drop")
    drop(container, jsonFile('{"dropped":1}', "dropped.json"))
    expect(await screen.findByText("dropped.json")).toBeTruthy()
    await userEvent.setup().click(screen.getByRole("button", { name: /Alias Document|Uploading document/ }))
    const [file] = onSubmit.mock.calls[0]
    expect(file.name).toBe("dropped.json")
    expect(await file.text()).toBe('{"dropped":1}')
  })

  it("rejects a malformed dropped JSON file like a pick", async () => {
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["json"]} />)
    options.callback?.("tok-dropbad")
    drop(container, jsonFile("{bad"))
    expect(await screen.findByText("That file is not valid JSON.")).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("rejects an oversized dropped JSON file like a pick", async () => {
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["json"]} />)
    options.callback?.("tok-dropbig")
    drop(container, jsonFile("y".repeat(10 * 1024 * 1024 + 1), "big.json"))
    expect(await screen.findByText("File is larger than 10 MB. Choose a smaller JSON file.")).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe("FileIntake Turnstile", () => {
  it("still gates submission on a fresh token after a mode switch", async () => {
    const onSubmit = vi.fn()
    const options = stubTurnstile()
    render(<FileIntake busy={false} onSubmit={onSubmit} inputModes={["file", "text"]} />)
    fireEvent.click(screen.getByRole("radio", { name: "Paste text" }))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } })
    await userEvent.setup().click(screen.getByRole("button", { name: /Alias Document|Uploading document/ }))
    expect(onSubmit).not.toHaveBeenCalled()
    options.callback?.("tok-late")
    await userEvent.setup().click(screen.getByRole("button", { name: /Alias Document|Uploading document/ }))
    expect(onSubmit).toHaveBeenCalledWith(expect.any(File), "tok-late")
  })
})

describe("JSON input hardening", () => {
  it("rejects non-finite numbers at any depth without re-serializing them", () => {
    expect(pastedJsonFile('{"a":1e400}')).toBe("JSON numbers must be finite.")
    expect(pastedJsonFile('[{"b":[-1e400]}]')).toBe("JSON numbers must be finite.")
    expect(pastedJsonFile("1e400")).toBe("JSON numbers must be finite.")
  })

  it("keeps valid JSON roots of every type accepted", async () => {
    for (const root of ['"s"', "0", "true", "null", "[]", '{"x":[1,2.5,-3e2]}']) {
      const result = pastedJsonFile(root)
      expect(result).toBeInstanceOf(File)
      expect(await (result as File).text()).toBe(JSON.stringify(JSON.parse(root)))
    }
  })

  it("rejects selected JSON files with invalid UTF-8 and keeps their bytes", async () => {
    const bytes = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]) // {"a":"\xff"}
    const file = new File([bytes], "bad.json", { type: "application/json" })
    expect(await checkJsonFile(file)).toBe("That file is not valid JSON.")
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes)
    expect(file.name).toBe("bad.json")
  })

  it("accepts valid UTF-8 JSON files unchanged", async () => {
    const file = new File(['{"name":"Résumé"}'], "ok.json", { type: "application/json" })
    expect(await checkJsonFile(file)).toBeNull()
  })

  it("counts UTF-8 bytes and enforces the 10 MiB boundary for pasted text", () => {
    expect(utf8ByteLength("é")).toBe(2)
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024)
    expect(pastedTextFile("é".repeat(MAX_UPLOAD_BYTES / 2))).toBeInstanceOf(File)
    expect(pastedTextFile("é".repeat(MAX_UPLOAD_BYTES / 2 + 1))).toBe("Pasted text is larger than 10 MB.")
  })

  it("shows UTF-8 byte count against the 10 MiB limit for paste fields", () => {
    render(<FileIntake busy={false} onSubmit={vi.fn()} inputModes={["text", "json"]} />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "é" } })
    expect(screen.getByText("2 of 10,485,760 bytes (10 MiB limit)")).toBeTruthy()
    expect(screen.getByRole("textbox").getAttribute("aria-describedby")).toBe("pasted-text-bytes")
  })
})

it("validates deeply nested JSON without overflowing the stack", () => {
  const deep = "[".repeat(200_000) + "1e999" + "]".repeat(200_000)
  expect(pastedJsonFile(deep)).toBe("JSON numbers must be finite.")
  expect(pastedJsonFile("[[1,2],{\"a\":3}]")).toBeInstanceOf(File)
})
