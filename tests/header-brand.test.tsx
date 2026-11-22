// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { Header } from "@/components/Header"

// Surface is selected at module load; swap it per case through the mocked getter.
const state = vi.hoisted(() => ({ id: "lawyerlab" }))
vi.mock("@/surface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/surface")>()
  return {
    ...actual,
    get surface() {
      return actual.SURFACES[state.id as keyof typeof actual.SURFACES]
    },
  }
})

const tier = vi.hoisted(() => ({ signedIn: false, identity: null as unknown, me: null as unknown, login: vi.fn(), logout: vi.fn(async () => {}) }))
vi.mock("@/lib/useTier", () => ({ useTier: () => tier }))

afterEach(cleanup)

describe("Header brand mark", () => {
  it.each([
    { id: "lawyerlab", name: "LawyerLab", icon: "/lawyerlab-logo-mark.svg" },
    { id: "signal-lawyers", name: "Signal Lawyers", icon: "/signal-logo-mark.svg" },
  ])("renders the $id surface icon and name", ({ id, name, icon }) => {
    state.id = id
    const { container } = render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByRole("link", { name: `${name} home` })).toBeTruthy()
    expect(container.querySelector("img.brand-mark")?.getAttribute("src")).toBe(icon)
  })
})
