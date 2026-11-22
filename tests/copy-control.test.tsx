// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { CopyControl } from "@/components/CopyControl"

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it("announces only the explicitly available recovery action when clipboard access fails", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })
  render(<CopyControl content="assembled result" label="transaction review" />)
  fireEvent.click(screen.getByRole("button", { name: "Copy transaction review" }))
  expect(await screen.findByText("Copy failed. Clipboard access was unavailable. Try again.")).toBeTruthy()
  expect(screen.queryByText(/Select the .* content/)).toBeNull()
})
