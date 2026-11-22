// @vitest-environment jsdom
// Contract tests: the fixture's screening seam must speak the committed
// screenHiringPackageText contract from tool-parse (shapes verified against
// src/api/hiring-package-screening.js at tool-parse HEAD). Synthetic only.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"
import { HiringDescriptionReviewPrototype, type ScreeningRetryResult } from "@/components/HiringPackagePrototype"

afterEach(cleanup)

function screeningError(code: string) {
  return Object.assign(new Error("hiring package screening failed"), { code })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

it("applies the accepted shape {accepted, text, changed} and gates approval on the changed flag", async () => {
  const user = userEvent.setup()
  const approve = vi.fn()
  const retry = vi.fn(async () => ({ accepted: true as const, text: "Screened synthetic text", changed: true }))
  render(<HiringDescriptionReviewPrototype draft="Synthetic draft" changed={false} screeningState="ready" onApprove={approve} onRepost={vi.fn()} onRetryScreening={retry} />)
  fireEvent.change(screen.getByLabelText("Draft description"), { target: { value: "Edited synthetic text" } })
  await user.click(screen.getByRole("button", { name: "Screen edited draft" }))
  expect(screen.getByLabelText("Draft description")).toHaveValue("Screened synthetic text")
  expect(screen.getByText(/Screening changed this draft/)).toBeTruthy()
  expect(approve).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "Confirm this text" }))
  await user.click(screen.getByRole("button", { name: "Approve confirmed description" }))
  expect(approve).toHaveBeenCalledWith("Screened synthetic text")
})

it("rejects the category_1_detected shape with no approval, retry, or re-submission, even when expired", async () => {
  const user = userEvent.setup()
  const approve = vi.fn()
  const repost = vi.fn()
  const retry = vi.fn(async () => ({ accepted: false as const, code: "category_1_detected" as const }))
  const props = { draft: "Synthetic draft", changed: false, screeningState: "ready" as const, onApprove: approve, onRepost: repost, onRetryScreening: retry }
  const { rerender } = render(<HiringDescriptionReviewPrototype {...props} />)
  fireEvent.change(screen.getByLabelText("Draft description"), { target: { value: "Edited synthetic text" } })
  await user.click(screen.getByRole("button", { name: "Screen edited draft" }))
  rerender(<HiringDescriptionReviewPrototype {...props} expired />)
  expect(screen.getByRole("alert").textContent).toMatch(/Rejected: Category 1 content was detected/)
  expect(screen.queryByRole("button", { name: /approve/i })).toBeNull()
  expect(screen.queryByRole("button", { name: /retry screening/i })).toBeNull()
  expect(screen.queryByRole("button", { name: /re-submit current text/i })).toBeNull()
  expect(approve).not.toHaveBeenCalled()
  expect(repost).not.toHaveBeenCalled()
  expect(retry).toHaveBeenCalledOnce()
})

it("fails closed on a screening_unavailable error and preserves the draft", async () => {
  const user = userEvent.setup()
  const approve = vi.fn()
  const retry = vi.fn(async () => { throw screeningError("screening_unavailable") })
  render(<HiringDescriptionReviewPrototype draft="Synthetic draft" changed={false} screeningState="ready" onApprove={approve} onRepost={vi.fn()} onRetryScreening={retry} />)
  fireEvent.change(screen.getByLabelText("Draft description"), { target: { value: "Preserved edited draft" } })
  await user.click(screen.getByRole("button", { name: "Screen edited draft" }))
  expect(await screen.findByText("Screening retry failed. Your draft is still here; try again.")).toBeTruthy()
  expect(screen.getByLabelText("Draft description")).toHaveValue("Preserved edited draft")
  expect(screen.queryByRole("button", { name: /approve/i })).toBeNull()
  expect(approve).not.toHaveBeenCalled()
})

it("fails closed on a screening_invalid_result error and preserves the draft", async () => {
  const user = userEvent.setup()
  const approve = vi.fn()
  const retry = vi.fn(async () => { throw screeningError("screening_invalid_result") })
  render(<HiringDescriptionReviewPrototype draft="Synthetic draft" changed={false} screeningState="ready" onApprove={approve} onRepost={vi.fn()} onRetryScreening={retry} />)
  fireEvent.change(screen.getByLabelText("Draft description"), { target: { value: "Preserved edited draft" } })
  await user.click(screen.getByRole("button", { name: "Screen edited draft" }))
  expect(await screen.findByText("Screening retry failed. Your draft is still here; try again.")).toBeTruthy()
  expect(screen.getByLabelText("Draft description")).toHaveValue("Preserved edited draft")
  expect(approve).not.toHaveBeenCalled()
})

it("discards a stale accepted retry result when the parent supplies a new draft while the retry is pending", async () => {
  const user = userEvent.setup()
  const approve = vi.fn()
  const gate = deferred<ScreeningRetryResult>()
  const retry = vi.fn(() => gate.promise)
  const props = { draft: "Synthetic draft", changed: false, screeningState: "unavailable" as const, onApprove: approve, onRepost: vi.fn(), onRetryScreening: retry }
  const { rerender } = render(<HiringDescriptionReviewPrototype {...props} />)
  await user.click(screen.getByRole("button", { name: "Retry screening" }))
  rerender(<HiringDescriptionReviewPrototype {...props} draft="Newer parent draft" />)
  await act(async () => { gate.resolve({ accepted: true, text: "Stale screened text", changed: false }) })
  expect(screen.getByLabelText("Draft description")).toHaveValue("Newer parent draft")
  expect(screen.queryByText(/Screening changed this draft/)).toBeNull()
  expect(screen.getByRole("button", { name: "Retry screening" })).toBeTruthy()
  expect(approve).not.toHaveBeenCalled()
})

it("discards a stale category_1_detected rejection when the parent supplies a new draft while the retry is pending", async () => {
  const user = userEvent.setup()
  const approve = vi.fn()
  const gate = deferred<ScreeningRetryResult>()
  const retry = vi.fn(() => gate.promise)
  const props = { draft: "Synthetic draft", changed: false, screeningState: "unavailable" as const, onApprove: approve, onRepost: vi.fn(), onRetryScreening: retry }
  const { rerender } = render(<HiringDescriptionReviewPrototype {...props} />)
  await user.click(screen.getByRole("button", { name: "Retry screening" }))
  rerender(<HiringDescriptionReviewPrototype {...props} draft="Newer parent draft" />)
  await act(async () => { gate.resolve({ accepted: false, code: "category_1_detected" }) })
  expect(screen.getByLabelText("Draft description")).toHaveValue("Newer parent draft")
  expect(screen.queryByRole("alert")?.textContent ?? "").not.toMatch(/Rejected: Category 1/)
  expect(retry).toHaveBeenCalledOnce()
  // The newer draft is not blocked: a fresh retry applies normally.
  retry.mockResolvedValue({ accepted: true, text: "Newer screened text", changed: false })
  await user.click(screen.getByRole("button", { name: "Retry screening" }))
  expect(screen.getByLabelText("Draft description")).toHaveValue("Newer screened text")
  expect(screen.queryByRole("alert")?.textContent ?? "").not.toMatch(/Rejected: Category 1/)
})

it("discards a stale accepted retry result when the parent supplies a screened state while the retry is pending", async () => {
  const user = userEvent.setup()
  const approve = vi.fn()
  const gate = deferred<ScreeningRetryResult>()
  const retry = vi.fn(() => gate.promise)
  const props = { draft: "Synthetic draft", changed: false, screeningState: "unavailable" as const, onApprove: approve, onRepost: vi.fn(), onRetryScreening: retry }
  const { rerender } = render(<HiringDescriptionReviewPrototype {...props} />)
  await user.click(screen.getByRole("button", { name: "Retry screening" }))
  rerender(<HiringDescriptionReviewPrototype {...props} screeningState="ready" />)
  await act(async () => { gate.resolve({ accepted: true, text: "Stale screened text", changed: false }) })
  // Parent-supplied screened state stays intact; approval uses the screened draft, never the stale text.
  await user.click(screen.getByRole("button", { name: "Approve description" }))
  expect(approve).toHaveBeenCalledWith("Synthetic draft")
})

it("discards a stale accepted retry result when the parent reverts the draft to its earlier value while the retry is pending", async () => {
  const user = userEvent.setup()
  const approve = vi.fn()
  const gate = deferred<ScreeningRetryResult>()
  const retry = vi.fn(() => gate.promise)
  const props = { draft: "Synthetic draft", changed: false, screeningState: "unavailable" as const, onApprove: approve, onRepost: vi.fn(), onRetryScreening: retry }
  const { rerender } = render(<HiringDescriptionReviewPrototype {...props} />)
  await user.click(screen.getByRole("button", { name: "Retry screening" }))
  // A → B → A: the draft ends at its request-time value, so value equality would
  // let the stale result through; only a transition count can reject it.
  rerender(<HiringDescriptionReviewPrototype {...props} draft="Newer parent draft" />)
  rerender(<HiringDescriptionReviewPrototype {...props} draft="Synthetic draft" />)
  await act(async () => { gate.resolve({ accepted: true, text: "Stale screened text", changed: false }) })
  expect(screen.getByLabelText("Draft description")).toHaveValue("Synthetic draft")
  expect(screen.queryByText(/Screening changed this draft/)).toBeNull()
  expect(screen.getByRole("button", { name: "Retry screening" })).toBeTruthy()
  expect(approve).not.toHaveBeenCalled()
  expect(retry).toHaveBeenCalledOnce()
  // The reverted draft is not blocked: a fresh retry applies normally.
  retry.mockResolvedValue({ accepted: true, text: "Fresh screened text", changed: false })
  await user.click(screen.getByRole("button", { name: "Retry screening" }))
  expect(screen.getByLabelText("Draft description")).toHaveValue("Fresh screened text")
})

it("discards a stale accepted retry result when the parent reverts the screening state while the retry is pending", async () => {
  const user = userEvent.setup()
  const approve = vi.fn()
  const gate = deferred<ScreeningRetryResult>()
  const retry = vi.fn(() => gate.promise)
  const props = { draft: "Synthetic draft", changed: false, screeningState: "ready" as const, onApprove: approve, onRepost: vi.fn(), onRetryScreening: retry }
  const { rerender } = render(<HiringDescriptionReviewPrototype {...props} />)
  fireEvent.change(screen.getByLabelText("Draft description"), { target: { value: "Edited synthetic text" } })
  await user.click(screen.getByRole("button", { name: "Screen edited draft" }))
  // ready → unavailable → ready: the screening state ends at its request-time
  // value, so the stale result must still be discarded by transition count.
  rerender(<HiringDescriptionReviewPrototype {...props} screeningState="unavailable" />)
  rerender(<HiringDescriptionReviewPrototype {...props} screeningState="ready" />)
  await act(async () => { gate.resolve({ accepted: true, text: "Stale screened text", changed: false }) })
  // The parent-screened draft wins; approval must send it, never the stale text.
  await user.click(screen.getByRole("button", { name: "Approve description" }))
  expect(approve).toHaveBeenCalledExactlyOnceWith("Synthetic draft")
})
