// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { Header } from "@/components/Header"
import { MemoryRouter } from "react-router-dom"

const tier = vi.hoisted(() => ({ signedIn: false, identity: null as unknown, me: null as unknown, login: vi.fn(), logout: vi.fn(async () => {}) }))
vi.mock("@/lib/useTier", () => ({ useTier: () => tier }))

beforeEach(() => {
  tier.signedIn = false
  tier.identity = null
  tier.me = null
  tier.login.mockClear()
  tier.logout.mockClear()
})
afterEach(cleanup)

describe("Header", () => {
  it("links the brand home and omits deferred navigation", () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByRole("link", { name: "LawyerLab home" }).getAttribute("href")).toBe("/")
    expect(screen.queryByRole("link", { name: "About" })).toBeNull()
    expect(screen.getByRole("link", { name: "Open Playground" }).getAttribute("href")).toBe("/playground/")
    expect(screen.queryByRole("link", { name: "Resources" })).toBeNull()
  })

  it("exposes the primary nav landmark with the public page links", () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    const nav = screen.getByRole("navigation", { name: "Primary" })
    expect(within(nav).getByRole("link", { name: "Our commitments" }).getAttribute("href")).toBe("/commitments/")
    expect(within(nav).getByRole("link", { name: "Work with us" }).getAttribute("href")).toBe("/work-with-us/")
  })

  it("signed out: Sign in is active and calls login", () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Sign in" })
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(tier.login).toHaveBeenCalledTimes(1)
    expect(tier.logout).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Log in" })).toBeNull()
  })

  it("signed in: Sign out is active, calls logout, and exposes a generic title", () => {
    tier.signedIn = true
    tier.me = { authenticated: true, tier: "member", quota: { limit: 2, used: 0, remaining: 2, resets_at: "2026-10-23T00:00:00.000Z" }, retention: { results_ttl_seconds: 86400, source_file_removed_after_processing: true, results_purged_after_all_parts_fetched: true } }
    render(<MemoryRouter><Header /></MemoryRouter>)
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Sign out" })
    expect(button.disabled).toBe(false)
    expect(button.getAttribute("title")).toBe("Signed in")
    fireEvent.click(button)
    expect(tier.logout).toHaveBeenCalledTimes(1)
    expect(tier.login).not.toHaveBeenCalled()
  })

  it("signed in: title shows the session name, then email, then the generic fallback", () => {
    tier.signedIn = true
    tier.identity = { name: "Ada Lovelace", email: "ada@example.test" }
    const { unmount } = render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByRole("button", { name: "Sign out" }).getAttribute("title")).toBe("Ada Lovelace")
    unmount()
    tier.identity = { name: null, email: "ada@example.test" }
    const second = render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByRole("button", { name: "Sign out" }).getAttribute("title")).toBe("ada@example.test")
    second.unmount()
    tier.identity = { name: null, email: null }
    render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByRole("button", { name: "Sign out" }).getAttribute("title")).toBe("Signed in")
  })

  it("links to the commitments and work-with-us pages", () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByRole("link", { name: "Our commitments" }).getAttribute("href")).toBe("/commitments/")
    expect(screen.getByRole("link", { name: "Work with us" }).getAttribute("href")).toBe("/work-with-us/")
  })

  it("links Join Waitlist to the landing waitlist form", () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByRole("link", { name: "Join Waitlist" }).getAttribute("href")).toBe("/#waitlist")
    expect(screen.getByRole("link", { name: "Join Waitlist" }).classList.contains("header-waitlist-landing")).toBe(false)
  })

  it("landing header marks the waitlist action for mobile hiding", () => {
    render(<MemoryRouter><Header hideAccountAction /></MemoryRouter>)
    expect(screen.getByRole("link", { name: "Join Waitlist" }).classList.contains("header-waitlist-landing")).toBe(true)
  })
})
