// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { ProcessingState } from "@/components/ProcessingState"

afterEach(cleanup)

it("announces actual state changes and exposes an indeterminate named progress indicator", () => {
  const { rerender } = render(<ProcessingState message="Waiting to start…" />)
  const status = screen.getByRole("status")
  expect(status.textContent).toContain("Waiting to start…")
  const progress = screen.getByRole("progressbar", { name: "Waiting to start…" })
  expect(progress.hasAttribute("aria-valuenow")).toBe(false)
  rerender(<ProcessingState message="Preparing document…" />)
  expect(screen.getByRole("status")).toBe(status)
  expect(status.textContent).toContain("Preparing document…")
  expect(screen.getByRole("progressbar", { name: "Preparing document…" })).toBeTruthy()
})

it("moves focus to a dedicated processing state once and does not steal it on updates", () => {
  const { rerender } = render(<><ProcessingState message="Uploading…" focusOnMount /><button>Cancel</button></>)
  expect(document.activeElement).toBe(screen.getByRole("status"))
  screen.getByRole("button", { name: "Cancel" }).focus()
  rerender(<><ProcessingState message="Preparing…" focusOnMount /><button>Cancel</button></>)
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }))
})
