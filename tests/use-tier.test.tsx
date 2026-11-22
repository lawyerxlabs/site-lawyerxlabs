// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { TierProvider, useTier } from "@/lib/useTier"

const wrapper = ({ children }: { children: ReactNode }) => <TierProvider>{children}</TierProvider>

const fetchMock = vi.fn()
// Authentic deployed /v1/me member payload (tool-parse smoke-api.js).
const MEMBER_ME = {
  authenticated: true,
  tier: "member",
  quota: { limit: 2, used: 0, remaining: 2, resets_at: "2026-10-23T00:00:00.000Z" },
  retention: { results_ttl_seconds: 86400, source_file_removed_after_processing: true, results_purged_after_all_parts_fetched: true },
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("useTier ready", () => {
  it("is false until the initial refresh settles, then reports the signed-in session", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/api/auth/session")
          ? new Response(JSON.stringify({ authenticated: true }), { status: 200 })
          : new Response(JSON.stringify(MEMBER_ME), { status: 200 }),
      ),
    )
    const { result } = renderHook(() => useTier(), { wrapper })
    expect(result.current.ready).toBe(false)
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.signedIn).toBe(true)
  })

  it("becomes ready as signed-in while the profile request is still pending", async () => {
    fetchMock.mockImplementation((url: string) => url.endsWith("/api/auth/session")
      ? Promise.resolve(new Response(JSON.stringify({ authenticated: true }), { status: 200 }))
      : new Promise(() => {}))
    const { result } = renderHook(() => useTier(), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.signedIn).toBe(true)
    expect(result.current.me).toBeNull()
  })

  it("remains ready and signed-in when the profile request rejects", async () => {
    fetchMock.mockImplementation((url: string) => url.endsWith("/api/auth/session")
      ? Promise.resolve(new Response(JSON.stringify({ authenticated: true }), { status: 200 }))
      : Promise.reject(new TypeError("profile unavailable")))
    const { result } = renderHook(() => useTier(), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.signedIn).toBe(true)
    expect(result.current.me).toBeNull()
  })

  it("becomes ready as signed-out when the session request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"))
    const { result } = renderHook(() => useTier(), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.signedIn).toBe(false)
    expect(result.current.me).toBeNull()
  })
})

describe("useTier shared state", () => {
  it("one logout updates every consumer and navigates through the logout endpoint", async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(url.endsWith("/api/auth/session") ? { authenticated: true } : MEMBER_ME), { status: 200 })))
    const location = { href: "" }
    vi.stubGlobal("location", location)
    const { result } = renderHook(() => ({ a: useTier(), b: useTier() }), { wrapper })
    await waitFor(() => expect(result.current.a.ready).toBe(true))
    await act(() => result.current.a.logout())
    expect(result.current.a.signedIn).toBe(false)
    expect(result.current.b.signedIn).toBe(false)
    expect(location.href).toBe("/api/auth/logout")
  })
})

describe("useTier login", () => {
  it("sends the current pathname and search as returnTo", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ authenticated: false }), { status: 200 })))
    const location = { pathname: "/playground/jobs/abc", search: "?tab=2", href: "" }
    vi.stubGlobal("location", location)
    const { result } = renderHook(() => useTier(), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))
    act(() => result.current.login())
    expect(location.href).toBe("/login/?returnTo=%2Fplayground%2Fjobs%2Fabc%3Ftab%3D2")
  })
})
