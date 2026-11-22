import { afterEach, expect, it, vi } from "vitest"
import { ApiError, createHrSession, generateHrSession, hrFriendlyError } from "@/lib/api"

const session = { session_id: "s1", status: "source_ready", criteria: [] }
const mockFetch = () => { const f = vi.fn(async () => new Response(JSON.stringify(session), { status: 201, headers: { "content-type": "application/json" } })); vi.stubGlobal("fetch", f); return f }
afterEach(() => vi.unstubAllGlobals())

it("sends a PDF as multipart with no verification field", async () => {
  const f = mockFetch()
  await createHrSession({ kind: "pdf", file: new File(["pdf"], "role.pdf", { type: "application/pdf" }) })
  const body = (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData
  expect(body).toBeInstanceOf(FormData)
  expect(body.has("cf_turnstile_response")).toBe(false)
  expect(body.get("file")).toBeInstanceOf(File)
})

it("sends pasted text as JSON without a token", async () => {
  const f = mockFetch()
  await createHrSession({ kind: "pasted_text", text: "hello" })
  const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1]
  expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json")
  expect(JSON.parse(init.body as string).source.text).toBe("hello")
})

it("rejects a 2xx that is not the contract status", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(session), { status: 200 })))
  await expect(createHrSession({ kind: "pasted_text", text: "hello" })).rejects.toMatchObject({ code: "unexpected_status" })
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 201 })))
  await expect(generateHrSession("s1", [], "stable-retry-key-0001")).rejects.toMatchObject({ code: "unexpected_status" })
})

it("maps HR error codes to HR messages, not the upload ones", () => {
  const e = (code: string, status = 422) => new ApiError(status, code, "x", null)
  expect(hrFriendlyError(e("pii_rejected"))).toMatch(/personal file/)
  expect(hrFriendlyError(e("rate_limit_exceeded", 429))).not.toMatch(/upload/)
  expect(hrFriendlyError(e("generation_limit_reached", 429))).toMatch(/Generation limit/)
  expect(hrFriendlyError(e("generation_budget_exhausted", 429))).toMatch(/tomorrow/)
  expect(hrFriendlyError(e("generation_outcome_unknown", 502))).toMatch(/Do not retry with a new request/)
  expect(hrFriendlyError(e("turnstile_required", 400))).toMatch(/verification/)
})

it("sends a first-party idempotency header for generation", async () => {
  const f = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
  vi.stubGlobal("fetch", f)
  await generateHrSession("s1", [], "stable-retry-key-0001")
  expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ "Idempotency-Key": "stable-retry-key-0001" })
})
