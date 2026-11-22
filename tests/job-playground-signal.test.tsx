// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { JobPlayground } from "@/pages/JobPlayground"

const state = vi.hoisted(() => ({ surface: "signal-lawyers" }))

vi.mock("@/surface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/surface")>()
  return { ...actual, surface: actual.SURFACES[state.surface] }
})

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, getJob: vi.fn(() => new Promise(() => {})) }
})

vi.mock("@/lib/useTier", () => ({ useTier: () => ({ me: null, signedIn: true, ready: true, login: vi.fn(), logout: vi.fn() }) }))

afterEach(cleanup)

describe("JobPlayground under signal-lawyers", () => {
  it("uses alias-doc when no workflow param is supplied (alias-doc is enabled under signal-lawyers)", () => {
    render(
      <MemoryRouter initialEntries={["/playground/jobs/signal-job"]}>
        <Routes>
          <Route path="/playground/jobs/:jobId" element={<JobPlayground />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByText("Workflow unavailable.")).toBeNull()
  })

  it("shows unavailable for an unknown workflow param", () => {
    render(
      <MemoryRouter initialEntries={["/playground/jobs/signal-job?workflow=nope"]}>
        <Routes>
          <Route path="/playground/jobs/:jobId" element={<JobPlayground />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole("status")).toHaveTextContent("Workflow unavailable.")
  })

  it("rejects contract-review from the generic result workspace", () => {
    render(
      <MemoryRouter initialEntries={["/playground/jobs/signal-job?workflow=contract-review"]}>
        <Routes>
          <Route path="/playground/jobs/:jobId" element={<JobPlayground />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole("status")).toHaveTextContent("Workflow unavailable.")
  })
})
