import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, acceptsContractReviewArtifact, createTxSession, deleteJob, deleteTxSession, friendlyError, fetchWorkflowCapabilities, getJob, getMarkdown, getMe, getReport, getTxSession, upload } from "@/lib/api"

afterEach(() => vi.restoreAllMocks())

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })
}

describe("LawLabs API client", () => {
  const validMe = {
    authenticated: false,
    tier: "anonymous",
    quota: { limit: 3, used: 1, remaining: 2, resets_at: "2026-10-24T00:00:00.000Z" },
    retention: { source_file_removed_after_processing: true, results_ttl_seconds: 3600, results_purged_after_all_parts_fetched: true },
  }

  const txSession = {
    session_id: "tx-123",
    status: "ready",
    source: { kind: "pasted_text" },
    matched_template: { id: "ontario-orea-form-100-aps", name: "OREA Form 100 APS", version: "1" },
    fields: {},
  }

  it("accepts only the bounded contract-review artifact shape", () => {
    expect(acceptsContractReviewArtifact({ artifact: { type: "contract-review-v1", schema_version: "1", summary: "Protected review", claims: [{ documentId: "doc", anchorId: "anchor", quote: "⟦PSEUDO:PERSON:ABC123⟧ agrees." }] } })).toBe(true)
    expect(acceptsContractReviewArtifact({ artifact: { type: "contract-review-v1", schema_version: "1", summary: "Protected review", claims: [{ documentId: "doc", anchorId: "a", quote: "one" }, { documentId: "doc", anchorId: "b", quote: "two" }] } })).toBe(false)
  })

  it("rejects extra source/mappings/restoration data and malformed or null data", () => {
    const bad = [
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [{ documentId: "d", anchorId: "a", quote: "q" }] }, extra: {} },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [{ documentId: "d", anchorId: "a", quote: "q", mapping: {} }] } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [{ documentId: "d", anchorId: "a", quote: "q" }], restoration: {} } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [{ documentId: "d", anchorId: "a", quote: "q" }], source: {} } },
      { artifact: { type: "contract-review-v1", schema_version: "2", summary: "s", claims: [{ documentId: "d", anchorId: "a", quote: "q" }] } },
      { artifact: { type: "other-v1", schema_version: "1", summary: "s", claims: [{ documentId: "d", anchorId: "a", quote: "q" }] } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: 1, claims: [{ documentId: "d", anchorId: "a", quote: "q" }] } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [] } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [{ documentId: "d", anchorId: "a", quote: "q" }, { documentId: "d", anchorId: "a", quote: "q" }] } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: null } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [{ documentId: "d", anchorId: "a", quote: "q", extra: 1 }] } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [null] } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [{}] } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [{ documentId: " ", anchorId: "a", quote: "q" }] } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [{ documentId: "d", anchorId: " ", quote: "q" }] } },
      { artifact: { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [{ documentId: "d", anchorId: "a", quote: " " }] } },
      { artifact: { type: "contract-review-v1", schema_version: "1", claims: [{ documentId: "d", anchorId: "a", quote: "q" }] } },
      { type: "contract-review-v1", schema_version: "1", summary: "s", claims: [{ documentId: "d", anchorId: "a", quote: "q" }] },
      null,
      undefined,
      42,
    ]
    for (const value of bad) expect(acceptsContractReviewArtifact(value)).toBe(false)
  })

  it("rejects malformed nested workflow catalog values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ workflows: [{
      id: "contract-review", identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [".pdf"], pii_profile: "fixed",
      handling: { capability: "fixed", choices: ["pseudonymise"], default: "off" }, results: { markdown: false, report: false, artifact: true },
    }] })))
    await expect(fetchWorkflowCapabilities()).rejects.toMatchObject({ code: "invalid_workflow_catalog" })
  })

  it("never throws on a non-object artifact result", () => {
    expect(() => acceptsContractReviewArtifact("nope")).not.toThrow()
    expect(() => acceptsContractReviewArtifact({ artifact: 1 })).not.toThrow()
  })

  it("parses a valid workflow catalog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response({
      workflows: [{
        id: "contract-review",
        identity_requirement: "protected",
        intake_modes: ["file", "sample"],
        accepted_file_types: ["application/pdf"],
        pii_profile: "ontario-orea",
        handling: { capability: "selectable", choices: ["reject", "redact", "off", "pseudonymise"], default: "redact" },
        results: { markdown: true, report: true, artifact: true },
      }],
    }))
    const catalog = await fetchWorkflowCapabilities()
    expect(catalog).toHaveLength(1)
    expect(catalog[0].id).toBe("contract-review")
  })

  it("throws ApiError for nested malformed catalog fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    const cases: Record<string, unknown> = {
      bad_id: { workflows: [{ id: 1, identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [], pii_profile: "p", handling: { capability: "none", choices: [], default: null }, results: { markdown: false, report: false, artifact: false } }] },
      bad_identity: { workflows: [{ id: "c", identity_requirement: "private", intake_modes: ["file"], accepted_file_types: [], pii_profile: "p", handling: { capability: "none", choices: [], default: null }, results: { markdown: false, report: false, artifact: false } }] },
      bad_intake: { workflows: [{ id: "c", identity_requirement: "protected", intake_modes: ["file", "json"], accepted_file_types: [], pii_profile: "p", handling: { capability: "none", choices: [], default: null }, results: { markdown: false, report: false, artifact: false } }] },
      bad_file_type: { workflows: [{ id: "c", identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [1], pii_profile: "p", handling: { capability: "none", choices: [], default: null }, results: { markdown: false, report: false, artifact: false } }] },
      bad_pii: { workflows: [{ id: "c", identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [], pii_profile: 1, handling: { capability: "none", choices: [], default: null }, results: { markdown: false, report: false, artifact: false } }] },
      bad_capability: { workflows: [{ id: "c", identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [], pii_profile: "p", handling: { capability: "bogus", choices: [], default: null }, results: { markdown: false, report: false, artifact: false } }] },
      bad_choice: { workflows: [{ id: "c", identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [], pii_profile: "p", handling: { capability: "none", choices: ["keep"], default: null }, results: { markdown: false, report: false, artifact: false } }] },
      bad_default: { workflows: [{ id: "c", identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [], pii_profile: "p", handling: { capability: "none", choices: [], default: "keep" }, results: { markdown: false, report: false, artifact: false } }] },
      bad_result: { workflows: [{ id: "c", identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [], pii_profile: "p", handling: { capability: "none", choices: [], default: null }, results: { markdown: "yes", report: false, artifact: false } }] },
      bad_results_missing: { workflows: [{ id: "c", identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [], pii_profile: "p", handling: { capability: "none", choices: [], default: null }, results: { markdown: true } }] },
      bad_not_array: { workflows: "nope" },
    }
    for (const [name, body] of Object.entries(cases)) {
      fetchMock.mockResolvedValueOnce(response(body))
      await expect(fetchWorkflowCapabilities()).rejects.toMatchObject<ApiError>({ status: 502, code: "invalid_workflow_catalog" })
    }
    expect(fetchMock).toHaveBeenCalledTimes(Object.keys(cases).length)
  })

  it("settles to null when the catalog throws", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ workflows: [{ id: 1 }] }))
    const result = await fetchWorkflowCapabilities().catch(() => null)
    expect(result).toBeNull()
  })

  it("sends the selected template with pasted text and PDF transaction sources", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(txSession, { status: 201 }))
      .mockResolvedValueOnce(response({ ...txSession, source: { kind: "pdf" } }, { status: 201 }))

    await createTxSession({ kind: "pasted_text", text: "Ontario APS text" }, "auto")
    await createTxSession({ kind: "pdf", file: new File(["pdf"], "aps.pdf", { type: "application/pdf" }) }, "ontario-orea-form-100-aps")

    const [textUrl, textRequest] = fetchMock.mock.calls[0]
    expect(textUrl).toBe("/tx/v1/sessions")
    expect(textRequest).toMatchObject({ method: "POST" })
    expect(textRequest?.headers).toEqual({ "Content-Type": "application/json" })
    expect(JSON.parse(textRequest?.body as string)).toEqual({ source: { kind: "pasted_text", text: "Ontario APS text" }, template: "auto" })

    const [, pdfRequest] = fetchMock.mock.calls[1]
    expect(pdfRequest).toMatchObject({ method: "POST" })
    expect(pdfRequest?.headers).toEqual({})
    expect(pdfRequest?.body).toBeInstanceOf(FormData)
    expect((pdfRequest?.body as FormData).get("template")).toBe("ontario-orea-form-100-aps")
    expect((pdfRequest?.body as FormData).get("file")).toBeInstanceOf(File)
  })

  it("omits an unspecified template and encodes session IDs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(txSession, { status: 201 }))
      .mockResolvedValueOnce(response(txSession))

    await createTxSession({ kind: "pasted_text", text: "Ontario APS text" })
    await getTxSession("tx/a b")

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ source: { kind: "pasted_text", text: "Ontario APS text" } })
    expect(fetchMock.mock.calls[1][0]).toBe("/tx/v1/sessions/tx%2Fa%20b")
  })

  it("requires the transaction session delete endpoint to return 204", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(deleteTxSession("tx/a b")).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith("/tx/v1/sessions/tx%2Fa%20b", { method: "DELETE" })
  })

  it("returns the typed /v1/me body when it matches the server contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(validMe))
    expect(await getMe()).toEqual(validMe)
  })

  it("returns null for a malformed tier", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ ...validMe, tier: "guest" }))
    expect(await getMe()).toBeNull()
  })

  it("returns null for malformed nested quota or retention", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ ...validMe, quota: { ...validMe.quota, limit: "3" } }))
      .mockResolvedValueOnce(response({ ...validMe, quota: { ...validMe.quota, remaining: null } }))
      .mockResolvedValueOnce(response({ ...validMe, quota: { ...validMe.quota, resets_at: 1 } }))
      .mockResolvedValueOnce(response({ ...validMe, retention: { ...validMe.retention, results_ttl_seconds: "3600" } }))
      .mockResolvedValueOnce(response({ ...validMe, retention: { ...validMe.retention, source_file_removed_after_processing: "yes" } }))
      .mockResolvedValueOnce(response({ ...validMe, quota: undefined }))
    for (let i = 0; i < 6; i++) expect(await getMe()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })
  it("uploads through documented jobs endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ job_id: "j1", status: "queued" }))
    const file = new File(["%PDF-1.7"], "sample.pdf", { type: "application/pdf" })
    const job = await upload(file, "turnstile-token")
    expect(job.job_id).toBe("j1")
    expect(fetchMock.mock.calls[0][0]).toBe("/v1/jobs")
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe("POST")
    expect(init.body).toBeInstanceOf(FormData)
  })

  it("uses authoritative result paths and parses typed responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ job_id: "j1", status: "completed" }))
      .mockResolvedValueOnce(response("# Redacted", { headers: { "content-type": "text/markdown" } }))
      .mockResolvedValueOnce(response({ schema_version: "1", entity_counts: {}, low_confidence_spans: [], unprocessed_pages: [], dropped_images: 0 }))
    expect((await getJob("j1")).status).toBe("completed")
    expect(await getMarkdown("j1")).toBe("# Redacted")
    expect((await getReport("j1")).schema_version).toBe("1")
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/v1/jobs/j1",
      "/v1/jobs/j1/result/markdown",
      "/v1/jobs/j1/result/report",
    ])
  })

  it("maps structured errors and Retry-After", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ error: { code: "queue_full", message: "queue is full" } }, { status: 429, headers: { "Retry-After": "10" } }))
    await expect(getJob("j1")).rejects.toMatchObject<ApiError>({ status: 429, code: "queue_full", retryAfterSeconds: 10 })
  })

  it("deletes job through documented endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }))
    await deleteJob("j1")
    expect(fetchMock.mock.calls[0]).toEqual(["/v1/jobs/j1", { method: "DELETE" }])
  })

  it("treats deleting an already-purged job (404) as success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ error: { code: "not_found", message: "Job not found" } }, { status: 404 }))
    await expect(deleteJob("j1")).resolves.toBeUndefined()
  })

  it("still surfaces other delete failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ error: { code: "x", message: "boom" } }, { status: 500 }))
    await expect(deleteJob("j1")).rejects.toMatchObject({ status: 500 })
  })

  it("shows the specific page-count validation message for HTTP 400", () => {
    expect(friendlyError(new ApiError(400, "page_count_unknown", "PDF page count cannot be proven")))
      .toBe("Page count could not be determined — try another file")
  })

  it("shows the specific selectable-text message for HTTP 400", () => {
    expect(friendlyError(new ApiError(400, "too_few_text_pages", "document has too little extractable text")))
      .toBe("File has too little selectable text")
  })

  it("identifies a rejected Turnstile assertion for HTTP 403", () => {
    expect(friendlyError(new ApiError(403, "turnstile_failed", "Turnstile verification failed")))
      .toBe("Human verification was not accepted — refresh it and try again")
  })

  it("explains the daily anonymous upload limit for HTTP 429 rate_limit_exceeded", () => {
    expect(friendlyError(new ApiError(429, "rate_limit_exceeded", "daily anonymous limit reached")))
      .toBe("Daily anonymous upload limit reached — sign in or try again tomorrow")
  })

  it("keeps queue-full wording only for actual queue capacity", () => {
    expect(friendlyError(new ApiError(429, "queue_full", "queue is full", 10)))
      .toBe("Queue is full — try again in 10 seconds")
  })

  it("says too many jobs are processing for org_limit", () => {
    expect(friendlyError(new ApiError(429, "org_limit", "too many jobs in flight", 10)))
      .toBe("Too many jobs are currently processing — try again in 10 seconds")
  })

  it("humanizes Retry-After into minutes and hours", () => {
    expect(friendlyError(new ApiError(429, "queue_full", "", 90))).toBe("Queue is full — try again in 2 minutes")
    expect(friendlyError(new ApiError(429, "queue_full", "", 3600))).toBe("Queue is full — try again in 1 hour")
    expect(friendlyError(new ApiError(429, "queue_full", "", 7200))).toBe("Queue is full — try again in 2 hours")
  })

  it("falls back to a neutral message for unknown 429 codes", () => {
    expect(friendlyError(new ApiError(429, "error", "slow down", 30))).toBe("Too many requests — try again in 30 seconds")
    expect(friendlyError(new ApiError(429, "error", "slow down"))).toBe("Too many requests — try again later")
  })

  it("does not imply an account problem for other authorization failures", () => {
    expect(friendlyError(new ApiError(403, "forbidden", "anonymous identity required")))
      .toBe("Upload request could not be authorized — refresh and try again")
  })
})
