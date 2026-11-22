// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api"
import { JobPlayground } from "@/pages/JobPlayground"

const api = vi.hoisted(() => ({ getJob: vi.fn(), getMarkdown: vi.fn(), getReport: vi.fn(), deleteJob: vi.fn() }))
const tier = vi.hoisted(() => ({ signedIn: false, ready: true, login: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, ...api }
})
vi.mock("@/lib/useTier", () => ({ useTier: () => ({ me: null, signedIn: tier.signedIn, ready: tier.ready, login: tier.login, logout: vi.fn() }) }))

beforeEach(() => {
  tier.signedIn = false
  tier.ready = true
  tier.login.mockClear()
  Object.values(api).forEach((fn) => fn.mockClear())
})
afterEach(cleanup)

describe("JobPlayground signed out", () => {
  it("opens an owner-authorized plain redaction job without workflow metadata", async () => {
    api.getJob.mockResolvedValue({ job_id: "guest-job", status: "failed", created_at: "", started_at: null, completed_at: null, expires_at: null, max_bytes: 1, max_pages: 1 })
    render(
      <MemoryRouter initialEntries={["/playground/jobs/guest-job"]}>
        <Routes><Route path="/playground/jobs/:jobId" element={<JobPlayground />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole("heading", { name: "Document could not be processed" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Sign in to view this document" })).toBeNull()
  })

  it("opens a legacy prepare-doc job without requiring sign-in", async () => {
    api.getJob.mockResolvedValue({ job_id: "legacy-alias", status: "failed", workflow: { id: "prepare-doc" }, created_at: "", started_at: null, completed_at: null, expires_at: null, max_bytes: 1, max_pages: 1 })
    render(
      <MemoryRouter initialEntries={["/playground/jobs/legacy-alias"]}>
        <Routes><Route path="/playground/jobs/:jobId" element={<JobPlayground />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole("heading", { name: "Document could not be processed" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Sign in to view this document" })).toBeNull()
  })

  it("explains when an anonymous job belongs to another browser session", async () => {
    api.getJob.mockRejectedValue(new ApiError(403, "forbidden", "job belongs to another principal"))
    render(
      <MemoryRouter initialEntries={["/playground/jobs/another-session"]}>
        <Routes><Route path="/playground/jobs/:jobId" element={<JobPlayground />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText("This document belongs to another browser session. Open it in the browser where you prepared it.")).toBeTruthy()
  })

  it("uses server workflow metadata, not a tampered guest workflow query, to gate protected jobs", async () => {
    api.getJob.mockResolvedValue({ status: "completed", workflow: { id: "transaction-intake" } })
    render(
      <MemoryRouter initialEntries={["/playground/jobs/private-job?workflow=alias-doc"]}>
        <Routes>
          <Route path="/playground/jobs/:jobId" element={<JobPlayground />} />
        </Routes>
      </MemoryRouter>,
    )
    const gate = await screen.findByRole("heading", { name: "Sign in to view this document" }).then((heading) => heading.parentElement as HTMLElement)
    expect(within(gate).getByText("Workspace workflows require sign in.")).toBeTruthy()
    await userEvent.click(within(gate).getByRole("button", { name: "Sign in" }))
    expect(tier.login).toHaveBeenCalledTimes(1)
    expect(api.getJob).toHaveBeenCalledTimes(1)
    expect(api.getMarkdown).not.toHaveBeenCalled()
    expect(api.getReport).not.toHaveBeenCalled()
    expect(api.deleteJob).not.toHaveBeenCalled()
    for (const name of ["Copy working copy", "Download working copy", "Delete output"]) {
      expect(screen.queryByRole("button", { name })).toBeNull()
    }
  })

  it("also gates a protected job when its workflow query is missing", async () => {
    api.getJob.mockResolvedValue({ status: "completed", workflow: { id: "transaction-intake" } })
    render(
      <MemoryRouter initialEntries={["/playground/jobs/private-job"]}>
        <Routes><Route path="/playground/jobs/:jobId" element={<JobPlayground />} /></Routes>
      </MemoryRouter>,
    )
    await screen.findByRole("heading", { name: "Sign in to view this document" })
    expect(api.getJob).toHaveBeenCalledTimes(1)
    expect(api.getMarkdown).not.toHaveBeenCalled()
    expect(api.getReport).not.toHaveBeenCalled()
  })

  it("shows neither the sign-in gate nor the workspace while auth is still resolving", () => {
    tier.ready = false
    render(
      <MemoryRouter initialEntries={["/playground/jobs/private-job?workflow=alias-doc"]}>
        <Routes>
          <Route path="/playground/jobs/:jobId" element={<JobPlayground />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByRole("heading", { name: "Sign in to view this document" })).toBeNull()
    expect(api.getJob).not.toHaveBeenCalled()
    expect(api.getMarkdown).not.toHaveBeenCalled()
    expect(api.getReport).not.toHaveBeenCalled()
  })
})
