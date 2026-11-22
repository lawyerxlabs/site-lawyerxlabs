import { afterEach, describe, expect, it, vi } from "vitest"
import { createOnboardSession, createTxSession, upload } from "@/lib/api"

const ok = () => new Response(JSON.stringify({ job_id: "j" }), { status: 200 })

afterEach(() => vi.restoreAllMocks())

describe("workflow_settings wire format", () => {
  it("sends handling as a JSON workflow_settings form field", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => ok())
    const file = new File(["x"], "a.pdf")
    await upload(file, "tok", "transaction-session-intake", "reject")
    await upload(file, "tok", "docalias")
    await createOnboardSession([file], "redact")
    const forms = spy.mock.calls.map((c) => (c[1] as RequestInit).body as FormData)
    expect(forms[0].get("workflow_settings")).toBe('{"handling":"reject"}')
    expect(forms[1].has("workflow_settings")).toBe(false)
    expect(forms[2].get("workflow_settings")).toBe('{"handling":"redact"}')
  })

  it("puts workflow_settings in the JSON body for pasted-text tx sessions", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => ok())
    await createTxSession({ kind: "pasted_text", text: "t" }, "auto", "reject")
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ workflow_settings: { handling: "reject" } })
  })
})
