// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BrowserRouter } from "react-router-dom"
import { AppRoutes } from "@/routes"
import { PublicPage } from "@/pages/PublicPage"
import { TierProvider } from "@/lib/useTier"

vi.mock("@/lib/useTier", () => ({
  TierProvider: ({ children }: { children: ReactNode }) => children,
  useTier: () => ({ signedIn: false, login: vi.fn(), logout: vi.fn(), me: null }),
}))
vi.mock("@/surface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/surface")>()
  return { ...actual, surface: actual.SURFACES.lawyerlab }
})

const ROUTES: [string, string][] = [
  ["/about/", "About LawyerLab"],
  ["/example/", "Before and after"],
  ["/faq/", "Frequently asked questions"],
  ["/privacy/", "Privacy Policy"],
  ["/terms/", "Terms of Use"],
]

function renderAt(path: string) {
  window.history.replaceState({}, "", path)
  return render(<BrowserRouter><AppRoutes /></BrowserRouter>)
}

afterEach(cleanup)

describe("public information pages", () => {
  it.each(ROUTES)("serves %s with its heading and footer links", async (path, heading) => {
    const { container } = renderAt(path)
    await waitFor(() => expect(container.querySelector("h1")?.textContent).toBe(heading))
    const footerLinks = [...container.querySelectorAll(".site-footer-nav a")].map((a) => a.getAttribute("href"))
    expect(footerLinks).toEqual(["/about/", "/example/", "/faq/", "/privacy/", "/terms/"])
    expect(container.querySelectorAll("footer")).toHaveLength(1)
  })

  it.each(ROUTES)("sets document.title to %s — LawyerLab", async (path, heading) => {
    renderAt(path)
    await waitFor(() => expect(document.title).toBe(`${heading} — LawyerLab`))
  })

  it("marks privacy and terms as draft and under review", async () => {
    const { container } = renderAt("/privacy/")
    await waitFor(() => expect(container.querySelector(".draft-notice")?.textContent).toBe("Draft — under review"))
    cleanup()
    const terms = renderAt("/terms/")
    await waitFor(() => expect(terms.container.querySelector(".draft-notice")?.textContent).toBe("Draft — under review"))
  })

  it("links the Cloudflare Turnstile privacy addendum from the privacy policy", async () => {
    renderAt("/privacy/")
    const link = await screen.findByRole("link", { name: "Cloudflare Turnstile Privacy Addendum" })
    expect(link.getAttribute("href")).toBe("https://www.cloudflare.com/turnstile-privacy-policy/")
  })

  it("keeps the before/after example synthetic and on the engine placeholder shape", async () => {
    const { container } = renderAt("/example/")
    await waitFor(() => expect(container.querySelector("pre")).not.toBeNull())
    const after = container.querySelectorAll("pre")[1]?.textContent ?? ""
    expect(after).toMatch(/\[PERSON_[0-9A-F]{8}_1\]/)
    expect(after).not.toMatch(/Mira|Chen|Northstar|Maple|416-555/)
    expect(container.textContent).toMatch(/synthetic/)
  })
})

describe("public page title and focus on route change", () => {
  it("updates title, moves focus to the new h1, and restores LawyerLab (StrictMode)", async () => {
    const { rerender, unmount, container } = render(<StrictMode><TierProvider><BrowserRouter><PublicPage page="about" /></BrowserRouter></TierProvider></StrictMode>)
    await waitFor(() => expect(document.title).toBe("About LawyerLab — LawyerLab"))
    expect(document.activeElement).toBe(container.querySelector("h1"))

    rerender(<StrictMode><TierProvider><BrowserRouter><PublicPage page="faq" /></BrowserRouter></TierProvider></StrictMode>)
    await waitFor(() => expect(document.title).toBe("Frequently asked questions — LawyerLab"))
    expect(document.activeElement?.tagName).toBe("H1")
    expect(document.activeElement?.textContent).toBe("Frequently asked questions")

    unmount()
    expect(document.title).toBe("LawyerLab")
  })
})

describe("public copy safety", () => {
  it.each(["/about/", "/example/", "/faq/", "/privacy/", "/terms/"])("%s avoids unsupported claims", async (path) => {
    const { container } = renderAt(path)
    await waitFor(() => expect(container.querySelector("h1")).not.toBeNull())
    // Approved FAQ copy names Canada, "legal advice" and "safe" as scoped statements; only those exact phrases are exempt.
    const text = (container.textContent ?? "").replace(/processed in Canada\.|Is this legal advice\?|not a guarantee or legal advice|No\. LawyerLab is a tool\.|what’s safe to share/g, "")
    const banned = [
      /browser-only/i, /never (stored|retained|kept)/i, /no (logs|backups)/i, /we never/i,
      /\bAI-free\b/i, /non-AI/i, /does not use AI/i, /never trains?/i, /will not train/i,
      /\bdeleted immediately\b/i, /\bpermanently deleted\b/i, /we guarantee/i, /legal advice/i,
      /certified/i, /years of experience/i, /\bpartner(s)? at\b/i, /\bfirm\b.*\bfounded\b/i,
      /\bprivate processing\b/i, /\bsecure\b/i, /\bsafe\b/i, /\bcanada\b/i,
    ]
    for (const pattern of banned) expect(text, `${path} matched ${pattern}`).not.toMatch(pattern)
  })

  it("has no photo and no waitlist form on public pages", async () => {
    const { container } = renderAt("/about/")
    await waitFor(() => expect(container.querySelector("h1")).not.toBeNull())
    expect(container.querySelector("img:not(.brand-mark)")).toBeNull()
    expect(container.querySelector("form")).toBeNull()
  })
})
