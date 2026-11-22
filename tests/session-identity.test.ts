import { afterEach, describe, expect, it, vi } from "vitest"
import { getSession, identityLabel } from "@/lib/api"

afterEach(() => vi.unstubAllGlobals())

const respond = (body: unknown, ok = true) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 401 })))

describe("getSession identity", () => {
  it("returns trimmed name and email for an authenticated session", async () => {
    respond({ authenticated: true, sub: "user-1", name: "  Ada  ", email: "ada@example.test" })
    expect(await getSession()).toEqual({ sub: "user-1", name: "Ada", email: "ada@example.test" })
  })

  it("returns null identity fields when absent, non-string, or whitespace-only", async () => {
    respond({ authenticated: true, sub: "  \t", name: 7 })
    expect(await getSession()).toEqual({ sub: null, name: null, email: null })
    respond({ authenticated: true, sub: 7, name: 7 })
    expect(await getSession()).toEqual({ sub: null, name: null, email: null })
  })

  it("returns null (signed out) for 401, unauthenticated bodies, and network errors", async () => {
    respond({ authenticated: false }, false)
    expect(await getSession()).toBeNull()
    respond({ authenticated: false })
    expect(await getSession()).toBeNull()
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))
    expect(await getSession()).toBeNull()
  })
})

describe("identityLabel fallback", () => {
  it("prefers name, then email, then Signed in", () => {
    expect(identityLabel({ name: "Ada", email: "ada@example.test" })).toBe("Ada")
    expect(identityLabel({ name: null, email: "ada@example.test" })).toBe("ada@example.test")
    expect(identityLabel({ name: null, email: null })).toBe("Signed in")
    expect(identityLabel(null)).toBe("Signed in")
  })
})
