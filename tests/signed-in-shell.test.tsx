// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { Header } from "@/components/Header"
import { Shell } from "@/components/Shell"
import { TierProvider } from "@/lib/useTier"

// Authentic deployed /v1/me member payload (tool-parse test/smoke-api.js).
const MEMBER_ME = {
  authenticated: true,
  tier: "member",
  quota: { limit: 2, used: 0, remaining: 2, resets_at: "2026-10-23T00:00:00.000Z" },
  retention: { results_ttl_seconds: 86400, source_file_removed_after_processing: true, results_purged_after_all_parts_fetched: true },
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string) => Promise.resolve(new Response(
    JSON.stringify(url.endsWith("/api/auth/session") ? { authenticated: true } : MEMBER_ME),
    { status: 200 },
  )))
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// Regression: getMe populated `me` with the real payload; Header/Shell read a nonexistent `me.identity` and threw.
describe("signed-in chrome with authentic /v1/me payload", () => {
  it("Header renders Sign out with a generic title and no crash", async () => {
    render(<TierProvider><MemoryRouter><Header /></MemoryRouter></TierProvider>)
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: "Sign out" })
    await waitFor(() => expect(button.getAttribute("title")).toBe("Signed in"))
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/v1/me")).toBe(true)
  })

  it("Shell renders Sign out with a generic title and no crash", async () => {
    render(<TierProvider><MemoryRouter initialEntries={["/playground/"]}><Shell><p>Content</p></Shell></MemoryRouter></TierProvider>)
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: /Sign out/ })
    await waitFor(() => expect(button.getAttribute("title")).toBe("Signed in"))
  })
})
