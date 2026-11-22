// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"
import { AccessPending, Login } from "@/pages/Auth"

const state = vi.hoisted(() => ({ id: "lawyerlab" }))
vi.mock("@/surface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/surface")>()
  return { ...actual, get surface() { return actual.SURFACES[state.id as keyof typeof actual.SURFACES] } }
})

vi.mock("@/lib/useTier", () => ({
  useTier: () => ({ signedIn: false, identity: null, me: null, login: vi.fn(), logout: vi.fn() }),
}))

afterEach(() => { cleanup(); state.id = "lawyerlab" })

function renderLogin(path = "/login/") {
  render(<MemoryRouter initialEntries={[path]}><Login /></MemoryRouter>)
}

describe("Login", () => {
  it("posts an email-first sign-in request to the auth sidecar", () => {
    renderLogin("/login/?returnTo=%2Fplayground%2F%3Fworkflow%3Dalias-doc")
    const form = screen.getByRole("form", { name: "Sign in to LawyerLab" }) as HTMLFormElement
    expect(form.method).toBe("post")
    expect(form.getAttribute("action")).toBe("/api/auth/login")
    expect(within(form).getByLabelText("Email").getAttribute("type")).toBe("email")
    expect(within(form).getByDisplayValue("sign-in").getAttribute("name")).toBe("intent")
    expect(within(form).getByDisplayValue("/playground/?workflow=alias-doc").getAttribute("name")).toBe("returnTo")
    expect(within(form).getByRole("button", { name: "Continue with email" })).toBeTruthy()
    expect(screen.getByText("Don't have an account?").closest("p")?.textContent).toBe("Don't have an account? Join Waitlist")
    expect(screen.getByRole("link", { name: "Join Waitlist" }).getAttribute("href")).toBe("/#waitlist")
  })

  it("uses a safe fallback for an external returnTo", () => {
    renderLogin("/login/?returnTo=https%3A%2F%2Fevil.example")
    expect(screen.getByDisplayValue("/playground/").getAttribute("name")).toBe("returnTo")
    expect(screen.getByRole("link", { name: "Join Waitlist" }).getAttribute("href")).toBe("/#waitlist")
  })

  it("shows registration as a waitlist request without promising access", () => {
    renderLogin("/login/?mode=register")
    expect(screen.getByRole("heading", { name: "Join the LawyerLab waitlist" })).toBeTruthy()
    const form = screen.getByRole("form", { name: "Join the LawyerLab waitlist" })
    expect(within(form).getByDisplayValue("register").getAttribute("name")).toBe("intent")
    expect(within(form).getByRole("button", { name: "Join Waitlist" })).toBeTruthy()
    expect(screen.getByText(/does not grant access/i)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login/")
    expect(document.body.textContent).not.toContain("Logto")
  })

  it("associates the invalid-email error with the input", () => {
    renderLogin("/login/?error=invalid-email")
    const alert = screen.getByRole("alert")
    const email = screen.getByLabelText("Email")
    expect(alert.id).toBe("email-error")
    expect(email.getAttribute("aria-describedby")).toBe("email-error")
    expect(email.getAttribute("aria-invalid")).toBe("true")
  })

  it("restores the site title when leaving", () => {
    const { unmount } = render(<MemoryRouter><Login /></MemoryRouter>)
    expect(document.title).toBe("Sign in — LawyerLab")
    unmount()
    expect(document.title).toBe("LawyerLab")
  })
})

describe("AccessPending", () => {
  it("explains pending access without claiming a session or guaranteed invitation", () => {
    render(<MemoryRouter><AccessPending /></MemoryRouter>)
    expect(screen.getByRole("heading", { name: "Your access request is pending" })).toBeTruthy()
    expect(screen.getByText(/does not guarantee access/i)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Return home" }).getAttribute("href")).toBe("/")
    expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe("/login/")
    expect(document.body.textContent?.toLowerCase()).not.toContain("session")
  })

  it("restores the site title when leaving", () => {
    const { unmount } = render(<MemoryRouter><AccessPending /></MemoryRouter>)
    expect(document.title).toBe("Access pending — LawyerLab")
    unmount()
    expect(document.title).toBe("LawyerLab")
  })
})

describe.each([
  ["lawyerlab", "LawyerLab", "/lawyerlab-logo-mark.svg"],
  ["signal-lawyers", "Signal Lawyers", "/signal-logo-mark.svg"],
  ["human-resources", "Human Resources Lab", "/lawyerlab-logo-mark.svg"],
])("auth branding on %s", (id, name, icon) => {
  it.each([
    ["Login", () => <Login />],
    ["AccessPending", () => <AccessPending />],
  ])("shows surface image and accessible name on %s", (_stateName, Page) => {
    state.id = id
    render(<MemoryRouter><Page /></MemoryRouter>)
    const brand = screen.getByRole("link", { name: `${name} home` })
    expect(brand.getAttribute("href")).toBe("/")
    expect(brand.querySelector("img")?.getAttribute("src")).toBe(icon)
    expect(brand.querySelector("img")?.getAttribute("alt")).toBe("")
    expect(brand.querySelector("img")?.getAttribute("aria-hidden")).toBe("true")
  })
})

describe("Login on other surfaces", () => {
  it("brands sign-in with the signal-lawyers name and waitlist URL", () => {
    state.id = "signal-lawyers"
    renderLogin("/login/?returnTo=%2Fplayground%2F%3Fworkflow%3Dcase-analysis")
    expect(screen.getByRole("heading", { name: "Sign in to Signal Lawyers" })).toBeTruthy()
    expect(document.title).toBe("Sign in — Signal Lawyers")
    expect(screen.getByRole("link", { name: "Signal Lawyers home" }).getAttribute("href")).toBe("/")
    expect(screen.getByDisplayValue("/playground/?workflow=case-analysis").getAttribute("name")).toBe("returnTo")
    expect(screen.getByRole("link", { name: "Join Waitlist" }).getAttribute("href")).toBe("https://lawyerlab.ca/?source=signal-lawyers#waitlist")
    expect(document.body.textContent).not.toContain("LawyerLab")
  })

  it("brands registration and access-pending for human-resources", () => {
    state.id = "human-resources"
    renderLogin("/login/?mode=register")
    expect(screen.getByRole("heading", { name: "Join the Human Resources Lab waitlist" })).toBeTruthy()
    expect(document.body.textContent).not.toContain("LawyerLab")
    cleanup()
    render(<MemoryRouter><AccessPending /></MemoryRouter>)
    expect(screen.getByText(/Human Resources Lab access has not been enabled/)).toBeTruthy()
    expect(document.title).toBe("Access pending — Human Resources Lab")
  })
})
