import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, fetchArtifact, getMarkdown, getReport } from "@/lib/api"

afterEach(() => vi.restoreAllMocks())

const failure = (status: number) =>
  new Response(JSON.stringify({ error: { code: "already_fetched", message: "result already fetched" } }), {
    status,
    headers: { "content-type": "application/json" },
  })

describe("read-once result endpoints", () => {
  it.each([
    ["fetchArtifact", () => fetchArtifact("j1"), "/v1/jobs/j1/result/artifact"],
    ["getMarkdown", () => getMarkdown("j1"), "/v1/jobs/j1/result/markdown"],
    ["getReport", () => getReport("j1"), "/v1/jobs/j1/result/report"],
  ])("%s fetches once and does not retry a failed response", async (_name, call, url) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => failure(410))
    await expect(call()).rejects.toMatchObject<Partial<ApiError>>({ status: 410, code: "already_fetched" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(url)
  })

  it("fetchArtifact fetches the authoritative artifact path once on success", async () => {
    const artifact = { artifact: { type: "transaction-intake-v1", schema_version: "1", fields: [] }, warnings: [], evidence: [] }
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(artifact), { status: 200 }))
    expect(await fetchArtifact("j1")).toEqual(artifact)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/v1/jobs/j1/result/artifact"])
  })
})
