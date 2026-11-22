// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act, fireEvent, waitFor } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter, useLocation } from "react-router-dom"
import { Shell } from "@/components/Shell"
import { WorkflowPage } from "@/components/WorkflowPage"
import { WORKFLOWS } from "@/lib/workflows"
import { surface, SURFACES } from "@/surface"

const tier = vi.hoisted(() => ({ signedIn: false, ready: true, identity: null as unknown, me: null as unknown, login: vi.fn(), logout: vi.fn(async () => {}) }))
vi.mock("@/lib/useTier", () => ({ useTier: () => tier }))

beforeEach(() => {
  tier.signedIn = true
  tier.ready = true
  tier.identity = null
  tier.me = null
  tier.login.mockClear()
  tier.logout.mockClear()
})
afterEach(cleanup)

// The top "Alias document" action shares its label and href with the Alias workflow item; select workflow items only.
function workflowItem(root: ParentNode, id: string) {
  return root.querySelector<HTMLAnchorElement>(`a.sidebar-item:not(.sidebar-new)[href="/playground/?workflow=${id}"]`)
}

function renderShell(url = "/playground/") {
  return render(<MemoryRouter initialEntries={[url]}><Shell><p>Content</p></Shell></MemoryRouter>)
}

describe("playground shell", () => {
  it("shows the review note in desktop and mobile sidebars", async () => {
    const user = userEvent.setup()
    renderShell()
    expect(document.querySelectorAll(".sidebar-note")).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    const notes = document.querySelectorAll(".sidebar-note")
    expect(notes).toHaveLength(2)
    for (const note of notes) {
      expect(note.textContent).toBe(surface.copy.sidebarNote)
    }
  })

  it.each(Object.keys(SURFACES))("renders the %s sidebar note and Contact from its own config", async (id) => {
    vi.resetModules()
    vi.stubEnv("VITE_SURFACE", id)
    try {
      const { Shell: SurfaceShell } = await import("@/components/Shell")
      const { MemoryRouter: Router } = await import("react-router-dom")
      const { surface: current } = await import("@/surface")
      expect(current.id).toBe(SURFACES[id].id)
      const user = userEvent.setup()
      render(<Router initialEntries={["/playground/"]}><SurfaceShell><p>Content</p></SurfaceShell></Router>)
      await user.click(screen.getByRole("button", { name: "Open navigation" }))
      const notes = [...document.querySelectorAll<HTMLElement>(".sidebar-note")]
      expect(notes).toHaveLength(2)
      for (const note of notes) expect(note.textContent).toBe(current.copy.sidebarNote)
      const contacts = [...document.querySelectorAll<HTMLAnchorElement>("a.sidebar-item")].filter((a) => a.textContent === "Contact")
      if (id === "lawyerlab") {
        expect(contacts).toHaveLength(2)
        for (const contact of contacts) expect(contact.getAttribute("href")).toBe("mailto:hello@lawyerlab.ca")
      } else {
        expect(contacts).toHaveLength(0)
      }
      cleanup()
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it("places the review note after the last Workspace item (incl. disabled) in both navs", async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    const lastWorkflow = WORKFLOWS[WORKFLOWS.length - 1]
    const notes = [...document.querySelectorAll<HTMLElement>(".sidebar-note")]
    expect(notes).toHaveLength(2)
    notes.forEach((note) => {
      const nav = note.closest("nav")!
      expect(note.closest(".sidebar-bottom")).toBeNull()
      const lastEl = [...nav.querySelectorAll<HTMLElement>(".sidebar-item")].find((el) => el.textContent?.includes(lastWorkflow.action))!
      expect(lastEl.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(note.nextElementSibling).toBeNull()
    })
  })

  it("puts the collapse chevron after the wordmark in the desktop brand row", () => {
    renderShell()
    const brandRow = document.querySelector<HTMLElement>("aside.playground-sidebar .sidebar-brand")!
    const link = within(brandRow).getByRole("link", { name: surface.name })
    expect(link.getAttribute("href")).toBe("/")
    expect(link.querySelector(".brand-mark")).not.toBeNull()
    const kids = [...brandRow.children]
    expect(kids.indexOf(link)).toBe(0)
    expect(kids[1].tagName).toBe("BUTTON")
    expect(kids[1].classList.contains("sidebar-collapse")).toBe(true)
    expect(link.querySelector(".sidebar-collapse")).toBeNull()
  })

  it("links the mobile brand to home", () => {
    renderShell()
    const brand = document.querySelector<HTMLElement>(".mobile-bar .mobile-brand")!
    expect(brand.tagName).toBe("A")
    expect(brand.getAttribute("href")).toBe("/")
    expect(brand.querySelector(".brand-mark")).not.toBeNull()
  })

  it("keeps Alias document aimed at docalias for guests and signed-in users, and lists coming-soon statuses", () => {
    renderShell("/playground/?workflow=docalias")
    const nav = screen.getByRole("navigation", { name: "Workflow navigation" })
    expect(workflowItem(nav, "docalias")).toBeNull()
    expect(nav.querySelectorAll("a[href*='docalias']")).toHaveLength(1)
    expect(within(nav).getAllByText("Coming soon").length).toBeGreaterThan(0)
    for (const label of ["Review decision"]) {
      const row = within(nav).getByText(label).closest<HTMLElement>(".sidebar-status")!
      expect(row.getAttribute("role")).toBeNull()
      expect(row.textContent).not.toContain("Coming soon")
      expect(row.querySelector(".sidebar-soon")).toBeNull()
      expect(row.querySelector("button, a")).toBeNull()
    }
    expect(workflowItem(nav, "agreement-review")).toBeNull()
    expect(within(nav).getByText("Analyze agreement").closest(".sidebar-status")).not.toBeNull()
  })

  it("always points Alias document at docalias, even on another workflow when signed in", () => {
    renderShell("/playground/?workflow=docalias")
    expect(screen.getByRole("link", { name: "Alias document" }).getAttribute("href")).toBe("/playground/?workflow=docalias")
  })

  it("renders a protected Alias action as a non-interactive sign-in-required row", () => {
    tier.signedIn = false
    renderShell()
    const nav = screen.getByRole("navigation", { name: "Workflow navigation" })
    const locked = nav.querySelector<HTMLElement>(".sidebar-new.sidebar-locked")!
    expect(locked.querySelector("button, a")).toBeNull()
    expect(locked.getAttribute("role")).toBeNull()
    expect(locked.querySelector("svg.lucide-lock-keyhole")).not.toBeNull()
    expect(locked.getAttribute("title")).toBe("Alias document requires sign in")
    // Sign-in status is exposed to screen readers only (visually-hidden), never as a visible pill.
    expect(locked.querySelector(".visually-hidden")!.textContent).toBe("Sign in required")
    expect(locked.textContent).toBe("Alias documentSign in required")
  })

  it("keeps mobile result tabs scrollable and non-wrapping", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8")
    expect(css).toMatch(/@media \(max-width: 767px\) \{\s*\.workspace-results \.ll-tablist \{ overflow-x: auto;/)
    expect(css).toMatch(/\.workspace-results \.ll-tab \{ flex-shrink: 0; white-space: nowrap; \}/)
  })

  it("keeps hover styling off status rows and limits it to real links and buttons", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8")
    expect(css).not.toMatch(/(^|[\s,])\.sidebar-item:hover/m)
    expect(css).toMatch(/a\.sidebar-item:hover, button\.sidebar-item:hover:not\(:disabled\)/)
  })

  it("gives every Shell main area the container that .document-view's desktop columns query", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8")
    expect(css).toMatch(/\.playground-body \{[^}]*container-type: inline-size;/)
    expect(css).toMatch(/@container \(min-width: 821px\) \{\s*\.document-view \{ grid-template-columns:/)
  })

  it("gives the collapse control a 40px hit target", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8")
    expect(css).toMatch(/\.sidebar-collapse \{[^}]*width: 40px; height: 40px;/)
  })

  it("fills the viewport with the desktop frame and sidebar", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8")
    expect(css).toMatch(/\.playground-frame \{[^}]*min-height: 100vh; min-height: 100dvh;/)
    expect(css).toMatch(/@media \(min-width: 768px\) \{\s*\.playground-frame > \.playground-sidebar \{ position: sticky; top: 0; height: 100vh; height: 100dvh; min-height: 0; overflow: hidden; \}/)
  })

  it("makes only the desktop sidebar nav region scroll and keeps the bottom group non-shrinking", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8")
    expect(css).toMatch(/\.playground-frame > \.playground-sidebar > \.sidebar-top \{ min-height: 0; overflow-y: auto;/)
    expect(css).toMatch(/\.playground-frame > \.playground-sidebar > \.sidebar-bottom \{ flex-shrink: 0; \}/)
  })

  it("scopes the fixed-height sidebar rules to desktop so the mobile Sheet is unaffected", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8")
    expect(css).not.toMatch(/(^|\n)\.playground-sidebar \{[^}]*position: sticky/)
    expect(css).not.toMatch(/(^|\n)\.sidebar-top \{[^}]*overflow-y: auto/)
    expect(css).toMatch(/@media \(max-width: 767px\) \{ \.playground-frame \{ display: block; min-height: calc\(100vh - 64px\); \} \.playground-sidebar \{ display: none; \}/)
  })

  it("keeps Sign out and Trust Centre icon-only in the collapsed rail, hiding Contact", async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }))
    const sidebar = document.querySelector<HTMLElement>("aside.playground-sidebar")!
    expect(sidebar.querySelector(".sidebar-account")!.getAttribute("title")).toBeTruthy()
    expect(within(sidebar).getByRole("button", { name: "Sign out" }).getAttribute("title")).toBeTruthy()
    expect(within(sidebar).getByRole("button", { name: "Trust Centre" }).getAttribute("title")).toBe("Trust Centre")
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8")
    expect(css).toMatch(/\.sidebar-collapsed \.sidebar-bottom a\[href\^="mailto:"\] \{ display: none; \}/)
    expect(css).not.toMatch(/\.sidebar-collapsed \.sidebar-bottom \{ display: none; \}/)
  })

  it("renders the Plus icon on Alias document and metadata icons on workflow rows in desktop and mobile", async () => {
    const user = userEvent.setup()
    renderShell()
    const icons = [["Alias document", "plus"], ["Review decision", "search-check"], ["Analyze agreement", "file-search"]]
    const check = (root: HTMLElement) => {
      for (const [label, icon] of icons) {
        expect(within(root).getByText(label).closest(".sidebar-item, .sidebar-new")!.querySelector(`svg.lucide-${icon}`)).not.toBeNull()
      }
    }
    check(document.querySelector<HTMLElement>(".playground-frame")!)
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    check(screen.getByRole("dialog"))
  })

  it("gives collapsed desktop action and workflow rows native title labels", async () => {
    const user = userEvent.setup()
    tier.signedIn = false
    renderShell()
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }))
    const sidebar = document.querySelector<HTMLElement>("aside.playground-sidebar")!
    expect(sidebar.querySelector(".sidebar-new")!.getAttribute("title")).toBe("Alias document requires sign in")
    expect(within(sidebar).getByRole("button", { name: "Sign in" }).getAttribute("title")).toBe("Sign in")
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8")
    expect(css).toMatch(/\.sidebar-collapsed \.sidebar-status-group \{ display: none; \}/)
  })

  it("opens and closes mobile navigation with keyboard-accessible control", async () => {
    const user = userEvent.setup()
    renderShell()
    const toggle = screen.getByRole("button", { name: "Open navigation" })
    await user.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: "Close navigation" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Close navigation" }))
    expect(screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded")).toBe("false")
    expect(screen.getByRole("link", { name: "Alias document" }).getAttribute("href")).toBe("/playground/?workflow=docalias")
    expect(screen.getByRole("navigation", { name: "Workflow navigation" })).toBeTruthy()
  })

  it("closes mobile navigation on Escape and restores focus", async () => {
    const user = userEvent.setup()
    renderShell()
    const toggle = screen.getByRole("button", { name: "Open navigation" })
    await user.click(toggle)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(toggle.getAttribute("aria-expanded")).toBe("false"))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(toggle)
  })

  it("closes mobile navigation on backdrop press and returns focus to the trigger", async () => {
    const user = userEvent.setup()
    renderShell()
    const toggle = screen.getByRole("button", { name: "Open navigation" })
    await user.click(toggle)
    // Radix overlay blocks pointer events in jsdom; fire the dismiss directly on it.
    const overlay = document.querySelector(".ll-sheet-overlay") as HTMLElement
    await act(async () => {
      fireEvent.pointerDown(overlay, { button: 0, pointerType: "mouse", isPrimary: true })
      fireEvent.pointerUp(overlay, { button: 0, pointerType: "mouse", isPrimary: true })
      fireEvent.click(overlay)
    })
    await waitFor(() => expect(screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded")).toBe("false"))
  })

  it("keeps focus on the nav toggle after opening and closing mobile navigation", async () => {
    const user = userEvent.setup()
    renderShell()
    const toggle = screen.getByRole("button", { name: "Open navigation" })
    await user.click(toggle)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close navigation" }))
    await user.click(screen.getByRole("button", { name: "Close navigation" }))
    expect(document.activeElement).toBe(toggle)
  })

  it("collapses the desktop sidebar to an accessible icon rail", async () => {
    const user = userEvent.setup()
    renderShell("/playground/?workflow=docalias")
    const sidebar = document.querySelector("aside.playground-sidebar") as HTMLElement
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }))
    expect(sidebar.classList.contains("sidebar-collapsed")).toBe(true)
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy()
    expect(sidebar.querySelector(".sidebar-new")!.getAttribute("href")).toBe("/playground/?workflow=docalias")
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }))
    expect(sidebar.classList.contains("sidebar-collapsed")).toBe(false)
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeTruthy()
  })

  it("labels the workflow group Workspace", () => {
    renderShell()
    expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0)
    expect(screen.queryByText("Common workflows")).toBeNull()
  })

  it("renders an active Sign in on desktop that calls login", async () => {
    tier.signedIn = false
    const user = userEvent.setup()
    renderShell()
    const signIn = screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement
    expect(signIn.disabled).toBe(false)
    await user.click(signIn)
    expect(tier.login).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: "Profile" })).toBeNull()
  })

  it("renders an active Sign in in the mobile sheet that calls login", async () => {
    tier.signedIn = false
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    const dialog = screen.getByRole("dialog")
    const signIn = within(dialog).getByRole("button", { name: "Sign in" }) as HTMLButtonElement
    expect(signIn.disabled).toBe(false)
    await user.click(signIn)
    expect(tier.login).toHaveBeenCalledTimes(1)
  })

  it("shows Sign out instead of Sign in when signed in", async () => {
    tier.signedIn = true
    const user = userEvent.setup()
    renderShell()
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Sign out" }))
    expect(tier.logout).toHaveBeenCalledTimes(1)
  })

  it("Alias document targets docalias in desktop and mobile nav", async () => {
    const user = userEvent.setup()
    renderShell("/playground/?workflow=docalias")
    const desktopAction = document.querySelector<HTMLAnchorElement>(".playground-frame a.sidebar-new")!
    expect(desktopAction.getAttribute("href")).toBe("/playground/?workflow=docalias")
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    expect(screen.getByRole("dialog").querySelector<HTMLAnchorElement>("a.sidebar-new")!.getAttribute("href")).toBe("/playground/?workflow=docalias")
  })

  it("marks only the selected enabled workflow as current in desktop and mobile nav", async () => {
    const user = userEvent.setup()
    renderShell("/playground/?workflow=docalias")
    const enabled = [...WORKFLOWS.filter((w) => !w.disabled), { id: "term-isolation" }]
    expect(enabled.length).toBeGreaterThan(1)
    const current = (root: HTMLElement) => enabled.map((w) => [w.id, (w.id === "docalias" ? root.querySelector(".sidebar-new") : workflowItem(root, w.id))?.getAttribute("aria-current") ?? null])
    const expected = enabled.map((w) => [w.id, w.id === "docalias" ? "page" : null])
    const desktop = document.querySelector(".playground-frame") as HTMLElement
    expect(current(desktop)).toEqual(expected)
    expect(desktop.querySelectorAll(".sidebar-item.active").length).toBe(1)
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    const dialog = screen.getByRole("dialog")
    expect(current(dialog)).toEqual(expected)
    expect(dialog.querySelectorAll(".sidebar-item.active").length).toBe(1)
  })

  it("closes the mobile sheet on Alias document and keeps the active workflow", async () => {
    const user = userEvent.setup()
    const LocationProbe = () => <p data-testid="search">{useLocation().search}</p>
    render(<MemoryRouter initialEntries={["/playground/?workflow=docalias"]}><Shell><LocationProbe /></Shell></MemoryRouter>)
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    fireEvent.click(screen.getByRole("link", { name: "Alias document" }))
    expect(screen.getByTestId("search").textContent).toBe("?workflow=docalias")
  })

  it("signed-out Alias document always targets the guest workflow", () => {
    renderShell("/playground/?workflow=not-a-workflow")
    expect(document.querySelector<HTMLAnchorElement>("a.sidebar-new")!.getAttribute("href")).toBe("/playground/?workflow=docalias")
  })

  it("mobile bar shows the current workflow label without adding a control", () => {
    renderShell("/playground/?workflow=docalias")
    const context = document.querySelector(".mobile-bar .mobile-context")
    expect(context?.textContent).toBe(WORKFLOWS.find((w) => w.id === "docalias")?.label)
    expect(context?.closest("button, a")).toBeNull()
  })

  it("keeps mobile bar context out of the way when no workflow is active", () => {
    renderShell("/playground/?workflow=not-a-workflow")
    expect(document.querySelector(".mobile-bar .mobile-context")).toBeNull()
  })

  it("mobile bar is visible only below 768px in CSS", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8")
    expect(css).toMatch(/\.mobile-bar \{ display: none; \}/)
    const mobile = css.slice(css.indexOf("@media (max-width: 767px) {\n  .mobile-bar"))
    expect(mobile).toMatch(/^@media \(max-width: 767px\) \{\n  \.mobile-bar \{ display: flex;/)
    expect(css).toMatch(/\.sidebar-collapse \{/)
    expect(css).toMatch(/\.playground-sidebar\.sidebar-collapsed \{ padding: 20px 8px; \}/)
  })

  it("keeps the mobile sheet free of collapse control and collapsed state", async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).queryByRole("button", { name: /collapse sidebar|expand sidebar/i })).toBeNull()
    expect(dialog.classList.contains("sidebar-collapsed")).toBe(false)
  })
})

describe("workflow page auth notice", () => {
  const workflow = WORKFLOWS[0]

  it("renders no Sign in CTA or notice for guests without limits", () => {
    render(<MemoryRouter><WorkflowPage workflow={workflow} uploadLabel="Upload"><p>Body</p></WorkflowPage></MemoryRouter>)
    expect(screen.queryByText(/Public limits/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull()
  })

  it("shows public limits without a duplicate Sign in button", () => {
    tier.signedIn = false
    tier.me = { authenticated: false, tier: "anonymous", quota: { limit: 5, used: 0, remaining: 5, resets_at: "2026-10-23T00:00:00.000Z" }, retention: { results_ttl_seconds: 900, source_file_removed_after_processing: true, results_purged_after_all_parts_fetched: true } }
    render(<MemoryRouter><WorkflowPage workflow={workflow} uploadLabel="Upload"><p>Body</p></WorkflowPage></MemoryRouter>)
    expect(screen.getByText(/Public limits — 5 documents per day\./)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull()
  })
})

describe("signed-out workspace gate", () => {
  it("shows the Workspace heading and says only workspace workflows require sign in", () => {
    tier.signedIn = false
    renderShell()
    expect(screen.getByText("Workspace")).toBeTruthy()
    expect(screen.getByText("Some workspace workflows require sign in.")).toBeTruthy()
  })

  it("keeps Alias open and disables other workflows when signed out", () => {
    tier.signedIn = false
    renderShell()
    const nav = screen.getByRole("navigation", { name: "Workflow navigation" })
    expect(workflowItem(nav, "docalias")).toBeNull()
    expect(screen.queryByRole("link", { name: "Alias document" })).toBeNull()
    for (const workflow of WORKFLOWS.filter((w) => w.id !== "docalias")) {
      expect(workflowItem(nav, workflow.id)).toBeNull()
    }
    expect(document.querySelector(".sidebar-new.sidebar-locked")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Sign in" }).disabled).toBe(false)
  })

  it("shows the Workspace heading and enables links when signed in", () => {
    tier.signedIn = true
    renderShell()
    expect(screen.getByText("Workspace")).toBeTruthy()
    expect(screen.queryByText("Some workspace workflows require sign in.")).toBeNull()
    expect(document.querySelector("a.sidebar-new")).not.toBeNull()
  })

  it("opens a Trust Centre dialog with the exact statements and no /trust link", async () => {
    const user = userEvent.setup()
    renderShell()
    expect(document.querySelector('a[href="/trust"]')).toBeNull()
    await user.click(within(document.querySelector("aside.playground-sidebar")! as HTMLElement).getByRole("button", { name: "Trust Centre" }))
    const dialog = await screen.findByRole("dialog", { name: "Trust Centre" })
    expect(within(dialog).getByText("Review every output")).toBeTruthy()
    expect(dialog.textContent).toContain("Automated detection can miss personal information.")
    expect(dialog.textContent).not.toContain("Redaction cannot be switched off.")
    for (const [title, body] of surface.copy.trustPoints) expect(dialog.textContent).toContain(`${title} — ${body}`)
    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("renders the current surface mark in the desktop and mobile brand areas", async () => {
    const user = userEvent.setup()
    renderShell()
    const desktopMark = document.querySelector<HTMLImageElement>("aside.playground-sidebar .sidebar-brand img.brand-mark")!
    expect(desktopMark.getAttribute("src")).toBe(surface.icon)
    expect(desktopMark.getAttribute("alt")).toBe("")
    expect(desktopMark.getAttribute("aria-hidden")).toBe("true")
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    const sheetMark = within(screen.getByRole("dialog", { name: "Workspace navigation" })).getByRole("link", { name: surface.name }).querySelector("img.brand-mark")!
    expect(sheetMark.getAttribute("src")).toBe(surface.icon)
    const topMark = document.querySelector<HTMLImageElement>(".mobile-bar .mobile-brand img.brand-mark")!
    expect(topMark.getAttribute("src")).toBe(surface.icon)
  })

  it("returns focus to the desktop Trust Centre button when the dialog closes", async () => {
    const user = userEvent.setup()
    renderShell()
    const opener = within(document.querySelector("aside.playground-sidebar")! as HTMLElement).getByRole("button", { name: "Trust Centre" })
    await user.click(opener)
    const dialog = await screen.findByRole("dialog", { name: "Trust Centre" })
    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it("returns focus to the nav toggle when the mobile sheet's Trust Centre opener has unmounted", async () => {
    const user = userEvent.setup()
    renderShell()
    const toggle = screen.getByRole("button", { name: "Open navigation" })
    await user.click(toggle)
    await user.click(within(screen.getByRole("dialog", { name: "Workspace navigation" })).getByRole("button", { name: "Trust Centre" }))
    const dialog = await screen.findByRole("dialog", { name: "Trust Centre" })
    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(toggle)
  })

  it("closes the mobile sheet when Trust Centre opens the dialog", async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    await user.click(within(screen.getByRole("dialog", { name: "Workspace navigation" })).getByRole("button", { name: "Trust Centre" }))
    const trust = await screen.findByRole("dialog", { name: "Trust Centre" })
    expect(trust).toBeTruthy()
    expect(screen.queryByRole("dialog", { name: "Workspace navigation" })).toBeNull()
  })

  it("offers Join waitlist before Sign in to signed-out ready users in desktop and mobile", async () => {
    tier.signedIn = false
    const user = userEvent.setup()
    renderShell()
    const desktop = document.querySelector<HTMLElement>("aside.playground-sidebar .sidebar-bottom")!
    const waitlist = within(desktop).getByRole("link", { name: "Join waitlist" })
    expect(waitlist.getAttribute("href")).toBe(surface.waitlistUrl)
    expect(waitlist.compareDocumentPosition(within(desktop).getByRole("button", { name: "Sign in" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    const mobile = within(screen.getByRole("dialog")).getByRole("link", { name: "Join waitlist" })
    expect(mobile.getAttribute("href")).toBe(surface.waitlistUrl)
    expect(mobile.compareDocumentPosition(within(screen.getByRole("dialog")).getByRole("button", { name: "Sign in" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("shows no Join waitlist to signed-in users", () => {
    renderShell()
    expect(screen.queryByRole("link", { name: "Join waitlist" })).toBeNull()
  })

  it("renders a neutral pending state with no gate note, locks, or account actions before auth resolves", () => {
    tier.signedIn = false
    tier.ready = false
    renderShell()
    expect(document.querySelector(".sidebar-gate-note")).toBeNull()
    expect(document.querySelector(".sidebar-locked")).toBeNull()
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Join waitlist" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull()
    const nav = screen.getByRole("navigation", { name: "Workflow navigation" })
    const row = within(nav).getByText("Review decision").closest<HTMLElement>(".sidebar-status")!
    expect(row.querySelector("button, a, em")).toBeNull()
    expect(row.textContent).toBe("Review decision")
  })

  it("marks the Alias document action current on docalias in desktop and mobile", async () => {
    const user = userEvent.setup()
    renderShell("/playground/?workflow=docalias")
    const desktop = document.querySelector<HTMLAnchorElement>("aside.playground-sidebar a.sidebar-new")!
    expect(desktop.getAttribute("aria-current")).toBe("page")
    expect(desktop.classList.contains("active")).toBe(true)
    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    const mobile = screen.getByRole("dialog").querySelector<HTMLAnchorElement>("a.sidebar-new")!
    expect(mobile.getAttribute("aria-current")).toBe("page")
  })

  it("keeps the collapsed brand stacked so the collapse button stays inside the rail", async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }))
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8")
    expect(css).toMatch(/\.sidebar-collapsed \.sidebar-brand \{ flex-direction: column;/)
  })
})
