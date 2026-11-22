// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { JobPlayground } from "@/pages/JobPlayground"

vi.mock("@/lib/useTier", () => ({ useTier: () => ({ me: null, signedIn: false, ready: false, login: vi.fn(), logout: vi.fn() }) }))

afterEach(cleanup)

describe("JobPlayground while session is unresolved", () => {
  it("renders the shell with a checking-session status instead of a blank page", () => {
    render(
      <MemoryRouter initialEntries={["/playground/jobs/abc"]}>
        <Routes>
          <Route path="/playground/jobs/:jobId" element={<JobPlayground />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole("status")).toHaveTextContent("Checking your session…")
  })
})
