// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { Playground } from "@/pages/Playground"

vi.mock("@/lib/useTier", () => ({
  useTier: () => ({ me: null, signedIn: false, ready: true, login: vi.fn(), logout: vi.fn() }),
}))

afterEach(cleanup)

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/playground/" element={<Playground />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("legacy prepare-doc links", () => {
  it("normalizes ?workflow=prepare-doc to the alias-doc workflow", () => {
    renderAt("/playground/?workflow=prepare-doc")
    expect(screen.queryByRole("heading", { name: "Workflow unavailable" })).toBeNull()
    expect(screen.getByRole("heading", { level: 1, name: "Alias" })).toBeTruthy()
  })

  it("keeps unknown workflow ids unavailable", () => {
    renderAt("/playground/?workflow=prepare-docx")
    expect(screen.getByRole("heading", { name: "Workflow unavailable" })).toBeTruthy()
  })
})
