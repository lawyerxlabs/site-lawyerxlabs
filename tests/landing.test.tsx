// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { Landing } from "@/pages/Landing"

vi.mock("@/lib/useTier", () => ({
  useTier: () => ({ signedIn: false, me: null, login: vi.fn(), logout: vi.fn(async () => {}) }),
}))

afterEach(cleanup)

function renderLanding(url = "/") {
  render(<MemoryRouter initialEntries={[url]}><Landing /></MemoryRouter>)
  return document.body
}

describe("Landing homepage", () => {
  it("shows the hero beside the Alias upload", () => {
    renderLanding()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Explore how to integrate AI into your practice—before you build around it.")
    expect(screen.getByRole("link", { name: "Open playground" }).getAttribute("href")).toBe("/playground/")
    expect(screen.getByLabelText("Trust summary")).toHaveTextContent("Detected details aliased")
    const box = within(document.getElementById("document-alias") as HTMLElement)
    expect(screen.getByRole("region", { name: "Upload a document to alias detected details" })).toBeTruthy()
  })

  it("keeps Commitments and Work with us in the header and public pages in the footer", () => {
    const body = renderLanding()
    const nav = within(screen.getByRole("navigation", { name: "Primary" }))
    expect(nav.getByRole("link", { name: "Our commitments" }).getAttribute("href")).toBe("/commitments/")
    expect(nav.getByRole("link", { name: "Work with us" }).getAttribute("href")).toBe("/work-with-us/")
    const footer = body.querySelector("footer.landing-footer") as HTMLElement
    expect([...footer.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/about/", "/example/", "/faq/", "/privacy/", "/terms/"])
    expect(footer.textContent).not.toContain("coming soon")
  })

  it("posts the waitlist signup to the waitlist endpoint with name and email required", async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    const body = renderLanding()
    const form = body.querySelector(".landing-waitlist form") as HTMLFormElement
    expect(within(form).getByLabelText("Name").hasAttribute("required")).toBe(true)
    expect(within(form).getByLabelText("Email").hasAttribute("required")).toBe(true)
    await userEvent.type(within(form).getByLabelText("Name"), "Ada Lovelace")
    await userEvent.type(within(form).getByLabelText("Email"), "ada@example.com")
    await userEvent.click(within(form).getByRole("button", { name: "Join Waitlist" }))
    const [url, init] = fetchMock.mock.calls.find(([url]) => url === "/api/waitlist") as unknown as [string, RequestInit]
    expect(url).toBe("/api/waitlist")
    expect(JSON.parse(init.body as string)).toEqual({ name: "Ada Lovelace", email: "ada@example.com", website: "", source: "lawyerlab" })
    expect((await screen.findByRole("status")).textContent).toContain("You are on the waitlist")
    vi.unstubAllGlobals()
  })

  it("tags the waitlist signup with the ?source= surface it came from", async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    const form = renderLanding("/?source=signal-lawyers").querySelector(".landing-waitlist form") as HTMLFormElement
    await userEvent.type(within(form).getByLabelText("Name"), "Ada Lovelace")
    await userEvent.type(within(form).getByLabelText("Email"), "ada@example.com")
    await userEvent.click(within(form).getByRole("button", { name: "Join Waitlist" }))
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/waitlist") as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).source).toBe("signal-lawyers")
    vi.unstubAllGlobals()
  })

  it("avoids claims contradicted by docs/TRUST-CLAIMS.md", () => {
    const text = renderLanding().textContent ?? ""
    for (const banned of ["Nothing kept", "lives only in your browser", "nothing goes to an AI", "not an AI chatbot", "Leave your email", "Both stay in your browser", "Outputs never", "no AI", "No AI", "browser-only", "Browser-only", "no server copy", "Presidio", "outside AI", "without relying", "local OCR", "OCR fallback"]) {
      expect(text).not.toContain(banned)
    }
    expect(text).toContain("Your original is deleted when processing finishes,")
    expect(text).toContain("LawyerLab replaces detected details and shows what changed.")
  })

  it("renders roadmap, transition, waitlist, and FAQ in order", () => {
    const body = renderLanding()
    const headings = [...body.querySelectorAll("main h2")].map((h) => h.textContent)
    expect(headings).toEqual([
      "Learning how to use AI in legal practice should not begin with a live client matter.",
      "Check the output, not the promise",
      "What we can promise, and what we can’t",
      "What we’re working on",
      "Frequently asked questions",
      "Looking to work more effectively with AI in your legal practice?",
      "Help shape what we are building",
    ])
    const main = body.querySelector("main") as HTMLElement
    const sections = [...main.querySelectorAll(":scope > section")]
    expect(sections.findIndex((section) => section.contains(document.getElementById("work-title")))).toBeLessThan(sections.findIndex((section) => section.contains(document.getElementById("start-title"))))
    expect(sections.findIndex((section) => section.classList.contains("landing-waitlist"))).toBe(sections.findIndex((section) => section.contains(document.getElementById("start-title"))) + 1)
    expect(sections.findIndex((section) => section.contains(document.getElementById("faq-title")))).toBeLessThan(sections.findIndex((section) => section.contains(document.getElementById("start-title"))))
    expect(body.querySelector("footer.landing-footer")).toBeTruthy()
  })

  it("keeps the privacy warning visible without a duplicate privacy line", () => {
    const body = renderLanding()
    expect(body.querySelector(".landing-privacy-line")).toBeNull()
    expect(body.textContent).toContain("Automated detection can miss things.")
  })

  it("labels the before/after email as synthetic", () => {
    const body = renderLanding()
    expect(body.textContent).toContain("These synthetic documents show what was replaced and what was left behind.")
  })

  it("has no contact form under the tools section", () => {
    const body = renderLanding()
    expect(body.querySelector("#work-title ~ .landing-form")).toBeNull()
    expect(body.querySelector("#work-title")).toBeTruthy()
  })

  it("uses the approved headings and keeps banned copy out of visible text", () => {
    const body = renderLanding()
    const headings = [...body.querySelectorAll("main h2")].map((h) => h.textContent)
    expect(headings).toContain("What we’re working on")
    expect(headings).not.toContain("Get access as each tool opens")
    expect(headings).not.toContain("About LawyerLab")
    expect(document.querySelector("section.landing-waitlist h2")?.textContent).toBe("Help shape what we are building")
    const visible = body.querySelector("main")?.textContent ?? ""
    expect(visible).not.toContain("Transaction analyzer")
    expect(visible).not.toContain("Want these tools in your own environment?")
  })

  it("renders the roadmap as a semantic table with the approved header row", () => {
    const body = renderLanding()
    const table = body.querySelector("#work-title ~ .table-scroll table") as HTMLTableElement
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Workflow", "Status", "Purpose"])
    expect([...table.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")?.textContent)).toEqual(["Document Alias", "Agreement to intake", "Case assessment"])
  })

  it("renders the three-step workflow as an ordered list of role, heading, and body", () => {
    const body = renderLanding()
    const steps = body.querySelectorAll(".pas-solution ol.landing-steps > li")
    expect(steps).toHaveLength(3)
    const expected = [
      ["INPUT", "Source document", "Upload one PDF or DOCX."],
      ["TOOL OUTPUT", "Aliased copy + report", "LawyerLab replaces detected details and shows what changed."],
      ["HUMAN DECISION", "Your review and decision", "Compare the result with the original before deciding what to use."],
    ]
    steps.forEach((li, i) => {
      expect(li.querySelector(".landing-step-role")?.textContent).toBe(expected[i][0])
      expect(li.querySelector("h3")?.textContent).toBe(expected[i][1])
      expect(li.querySelector("p:not(.landing-step-role)")?.textContent).toBe(expected[i][2])
    })
  })

  it("switches the sample between original and aliased text across all three tabs", async () => {
    const user = userEvent.setup()
    const body = renderLanding()
    // Email tab is default — check original
    expect(body.querySelector(".landing-sample pre")?.textContent).toContain("From: Mira Vale <mira@example.invalid>")
    // Flip switch — email aliased
    fireEvent.click(screen.getByRole("checkbox", { name: "Show aliased version" }))
    expect(body.querySelector(".landing-sample pre")?.textContent).toContain("[PERSON_B2A7F3BB_1] Vale <[EMAIL_ADDRESS_B2A7F3BB_7]>")
    // Agreement tab
    await user.click(screen.getByRole("tab", { name: "Agreement" }))
    expect(body.querySelector(".landing-sample pre")?.textContent).toContain("[ORGANIZATION_179A6A95_3]")
    // Invoice tab
    await user.click(screen.getByRole("tab", { name: "Invoice" }))
    expect(body.querySelector(".landing-sample pre")?.textContent).toContain("[PERSON_4FCCE5F1_4]")
  })

  it("uses a native details accordion as the only FAQ control", () => {
    const body = renderLanding()
    const faq = body.querySelector(".landing-faq") as HTMLElement
    expect(faq.querySelectorAll("details").length).toBe(8)
    expect(body.querySelectorAll("details").length).toBe(8)
    expect(faq.textContent).toContain("Where does my file go?")
    expect(faq.textContent).toContain("Documents are processed in Canada.")
  })

  it("renders the PAS section with problem, question rows, and workflow in one section", () => {
    const body = renderLanding()
    expect(body.textContent).not.toContain("Questions worth asking")
    expect(document.querySelector(".decision-framework")).toBeNull()
    expect([...body.querySelectorAll("h2")].some((h) => h.textContent === "How it works")).toBe(false)
    const section = document.querySelector("section.landing-pas") as HTMLElement
    expect(section.textContent).not.toContain("Before you start")
    const problem = section.querySelector(".pas-problem") as HTMLElement
    expect(problem.querySelector("h2")?.textContent).toBe("Learning how to use AI in legal practice should not begin with a live client matter.")
    expect(problem.textContent).toContain("Most lawyers have no structured way to learn where AI fits into their work.")
    expect(problem.textContent).toContain("The learning gap")
    expect(problem.textContent).toContain("Without practical training, the choice can feel like experimenting with client information or avoiding useful tools altogether.")
    expect(problem.querySelector("strong")?.textContent).toBe("Your professional duties do not change when AI is involved.")
    const questions = section.querySelector(".pas-questions") as HTMLElement
    expect(questions.querySelector("h3")?.textContent).toBe("Questions to ask before using AI in legal practice")
    expect(questions.textContent).not.toContain("Your professional duties")
    expect(questions.querySelector(".pas-closing")).toBeNull()
    const items = [...questions.querySelectorAll("ul > li")].map((li) => li.textContent)
    expect(questions.querySelector("ul")?.children.length).toBe(4)
    expect(items).toEqual([
      "What task are you asking AI to perform?",
      "What are the risks of giving AI this information?",
      "How will you identify errors made by AI?",
      "What judgment can you not delegate to AI?",
    ])
    for (const old of ["Is the task defined", "Consider confidentiality", "A useful-looking answer", "Decide who will review", "pas-question-row"]) {
      expect(section.innerHTML).not.toContain(old)
    }
    expect(section.querySelector(".pas-solution .eyebrow")?.textContent).toBe("Introducing DocAliaser")
    expect(section.querySelector(".pas-solution h3")?.textContent).toBe("A bounded workflow to experiment with redacting documents before deciding to use AI for a task.")
    const solutionCta = section.querySelector(".pas-solution .pas-solution-cta") as HTMLElement
    expect(within(solutionCta).getByRole("link", { name: "Start Playground" }).getAttribute("href")).toBe("/playground/")
    expect(solutionCta.querySelector("p.landing-cta-note")?.textContent).toBe("Try Document Alias or explore another bounded workflow.")
    expect(body.querySelector(".context-panels, .question-list")).toBeNull()
    expect(body.textContent).not.toContain("Yours to decide")
    expect(body.textContent).not.toContain("You want to use AI")
    expect(section.nextElementSibling?.querySelector("h2")?.textContent).toBe("Check the output, not the promise")
    expect(section.previousElementSibling?.classList.contains("trust-band")).toBe(true)
  })
})
