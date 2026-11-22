// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppRoutes } from "@/routes"
import { BrowserRouter, useLocation } from "react-router-dom"

const state = vi.hoisted(() => ({ id: "signal-lawyers" }))

vi.mock("@/App", () => ({ default: () => <p data-testid="mvp-app" /> }))
vi.mock("@/surface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/surface")>()
  return { ...actual, get surface() { return actual.SURFACES[state.id as keyof typeof actual.SURFACES] } }
})

function Location() {
  const location = useLocation()
  return <output>{location.pathname + location.search}</output>
}

beforeEach(() => {
  state.id = "signal-lawyers"
})

afterEach(cleanup)

describe("surface routes", () => {
  it("redirects signal-lawyers /mvp/ to its home", async () => {
    window.history.replaceState({}, "", "/mvp/")
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector("output")?.textContent).toBe("/playground/?workflow=term-isolation"))
  })

  it("redirects legacy transaction-intake paths to term-isolation", async () => {
    for (const path of ["/mvp/transaction-intake", "/playground/transaction-intake"]) {
      cleanup()
      window.history.replaceState({}, "", path)
      render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
      await waitFor(() => expect(document.querySelector("output")?.textContent).toBe("/playground/?workflow=term-isolation"))
    }
  })

  it("serves LawyerLabs homepage at /", async () => {
    state.id = "lawyerlab"
    window.history.replaceState({}, "", "/")
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector("h1")?.textContent).toBe("Technology that supports better decisions"))
    expect(document.body.textContent).toContain("LawyerLabs gives professionals, educators and organizations access to AI applications and tools that help bring relevant information into view before they decide.")
    expect(document.querySelector("output")?.textContent).toBe("/")
  })

  it.each([
    ["/products/", "Products", "LawyerLab", "Launch MCP"],
    ["/products/mcp/", "Launch MCP", "connect legal workflows", "unknown"],
  ])("serves umbrella route %s", async (path, heading, content, status) => {
    window.history.replaceState({}, "", path)
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector("h1")?.textContent).toBe(heading))
    expect(document.body.textContent).toContain(content)
    expect(document.body.textContent).toContain(status)
    expect(document.querySelector("output")?.textContent).toBe(path)
  })

  it("redirects legacy /mcp/ to the product page", async () => {
    state.id = "lawyerlab"
    window.history.replaceState({}, "", "/mcp/")
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector("output")?.textContent).toBe("/products/mcp/"))
  })

  it("redirects / to the playground for signal-lawyers", async () => {
    window.history.replaceState({}, "", "/")
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector("output")?.textContent).toBe("/playground/?workflow=term-isolation"))
  })

  it("keeps lawyerlab /mvp/ reachable", async () => {
    state.id = "lawyerlab"
    window.history.replaceState({}, "", "/mvp/")
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector('[data-testid="mvp-app"]')).not.toBeNull())
    expect(document.querySelector("output")?.textContent).toBe("/mvp/")
  })

  it.each([
    ["/login/", "Sign in to LawyerLab"],
    ["/access-pending/", "Your access request is pending"],
  ])("serves lawyerlab auth route %s", async (path, heading) => {
    state.id = "lawyerlab"
    window.history.replaceState({}, "", path)
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector(".auth-copy h1")?.textContent).toBe(heading))
    expect(document.querySelector("output")?.textContent).toBe(path)
  })

  it.each([
    ["signal-lawyers", "/login/", "Sign in to Signal Lawyers"],
    ["signal-lawyers", "/access-pending/", "Your access request is pending"],
    ["human-resources", "/login/", "Sign in to Human Resources Lab"],
    ["human-resources", "/access-pending/", "Your access request is pending"],
  ])("serves %s auth route %s without redirecting", async (id, path, heading) => {
    state.id = id
    window.history.replaceState({}, "", path)
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector(".auth-copy h1")?.textContent).toBe(heading))
    expect(document.querySelector("output")?.textContent).toBe(path)
  })

  it("serves the static commitments and work-with-us pages for lawyerlab", async () => {
    state.id = "lawyerlab"
    window.history.replaceState({}, "", "/commitments/")
    const { unmount } = render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector("#page-title")?.textContent).toBe("Our commitments, and where they end"))
    unmount()
    window.history.replaceState({}, "", "/work-with-us/")
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector("#page-title")?.textContent).toBe("Integrate LawyerLab into your workflows."))
    expect(document.querySelector('a[href="mailto:hello@lawyerlab.ca"]')).not.toBeNull()
  })
  it.each(["/playground/hr/hiring", "/mvp/hr/hiring"])("redirects legacy %s to the hr-hiring playground entry", async (path) => {
    state.id = "human-resources"
    window.history.replaceState({}, "", path)
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector("output")?.textContent).toBe("/playground/?workflow=hr-hiring"))
  })
})
