// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { FileIntake } from "@/components/FileIntake"

afterEach(() => {
  cleanup()
  delete (window as Window & { turnstile?: unknown }).turnstile
})

describe("FileIntake Turnstile configuration", () => {
  it("uses the gateway's expected upload action", () => {
    const renderWidget = vi.fn(() => "widget-1")
    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: { render: renderWidget, remove: vi.fn(), reset: vi.fn() },
    })

    render(<FileIntake onSubmit={vi.fn()} busy={false} />)

    expect(renderWidget).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({ action: "tool_parse_upload", appearance: "interaction-only" }),
    )
  })

  it("shows a quiet status row until Cloudflare needs interaction", () => {
    const renderWidget = vi.fn((_el: HTMLElement, _o: Record<string, () => void>) => "widget-1")
    Object.defineProperty(window, "turnstile", { configurable: true, value: { render: renderWidget, remove: vi.fn(), reset: vi.fn() } })
    render(<FileIntake onSubmit={vi.fn()} busy={false} />)
    const o = renderWidget.mock.calls[0][1] as Record<string, (t?: string) => void>
    const row = () => document.querySelector(".verification-row")!
    expect(screen.getByText("Verifying…")).toBeTruthy()
    expect(row().classList.contains("is-quiet")).toBe(true)
    act(() => o["before-interactive-callback"]())
    expect(row().classList.contains("is-quiet")).toBe(false)
    act(() => { o["after-interactive-callback"](); o.callback("tok") })
    expect(screen.getByText("Verified")).toBeTruthy()
    act(() => o["expired-callback"]())
    expect(screen.getByText("Verifying…")).toBeTruthy()
  })

  it("removes a preloaded widget when intake unmounts", () => {
    const remove = vi.fn()
    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: { render: vi.fn(() => "widget-1"), remove, reset: vi.fn() },
    })

    const { unmount } = render(<FileIntake onSubmit={vi.fn()} busy={false} />)
    unmount()

    expect(remove).toHaveBeenCalledWith("widget-1")
  })

  it("removes a freshly rendered widget when intake unmounts", () => {
    const remove = vi.fn()
    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: { render: vi.fn(() => "widget-2"), remove, reset: vi.fn() },
    })

    const { unmount } = render(<FileIntake onSubmit={vi.fn()} busy={false} />)
    expect(remove).not.toHaveBeenCalled()
    unmount()

    expect(remove).toHaveBeenCalledWith("widget-2")
  })
})

describe("FileIntake Turnstile script lifecycle", () => {
  const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js"

  afterEach(() => {
    document.querySelectorAll(`script[src="${SRC}"]`).forEach((el) => el.remove())
  })

  it("does not render into a detached container when the script loads after unmount", () => {
    const renderWidget = vi.fn(() => "widget-late")
    const { unmount } = render(<FileIntake onSubmit={vi.fn()} busy={false} />)
    const script = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`)
    expect(script).toBeTruthy()

    unmount()
    Object.defineProperty(window, "turnstile", { configurable: true, value: { render: renderWidget, remove: vi.fn(), reset: vi.fn() } })
    script!.dispatchEvent(new Event("load"))

    expect(renderWidget).not.toHaveBeenCalled()
  })

  it("detaches its load listener from a pre-existing script on unmount", () => {
    const existing = document.createElement("script")
    existing.src = SRC
    document.head.appendChild(existing)
    const renderWidget = vi.fn(() => "widget-late")

    const { unmount } = render(<FileIntake onSubmit={vi.fn()} busy={false} />)
    unmount()
    Object.defineProperty(window, "turnstile", { configurable: true, value: { render: renderWidget, remove: vi.fn(), reset: vi.fn() } })
    existing.dispatchEvent(new Event("load"))

    expect(renderWidget).not.toHaveBeenCalled()
  })
})

describe("FileIntake Turnstile size at narrow viewports", () => {
  function mockViewport(matches: boolean) {
    const listeners: Array<() => void> = []
    const mql = {
      matches,
      media: "(max-width: 420px)",
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    }
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => mql) })
    return {
      setMatches(next: boolean) {
        mql.matches = next
        listeners.forEach((fn) => fn())
      },
    }
  }

  it("renders compact at 420px and below", () => {
    mockViewport(true)
    const renderWidget = vi.fn(() => "widget-1")
    Object.defineProperty(window, "turnstile", { configurable: true, value: { render: renderWidget, remove: vi.fn(), reset: vi.fn() } })

    render(<FileIntake onSubmit={vi.fn()} busy={false} />)

    expect(renderWidget).toHaveBeenCalledWith(expect.any(HTMLDivElement), expect.objectContaining({ size: "compact" }))
  })

  it("renders normal above 420px", () => {
    mockViewport(false)
    const renderWidget = vi.fn(() => "widget-1")
    Object.defineProperty(window, "turnstile", { configurable: true, value: { render: renderWidget, remove: vi.fn(), reset: vi.fn() } })

    render(<FileIntake onSubmit={vi.fn()} busy={false} />)

    expect(renderWidget).toHaveBeenCalledWith(expect.any(HTMLDivElement), expect.objectContaining({ size: "normal" }))
  })

  it("re-renders the widget once when crossing the breakpoint", () => {
    const viewport = mockViewport(false)
    const remove = vi.fn()
    const renderWidget = vi.fn()
      .mockReturnValueOnce("widget-normal")
      .mockReturnValueOnce("widget-compact")
    Object.defineProperty(window, "turnstile", { configurable: true, value: { render: renderWidget, remove, reset: vi.fn() } })

    render(<FileIntake onSubmit={vi.fn()} busy={false} />)
    viewport.setMatches(true)

    expect(remove).toHaveBeenCalledWith("widget-normal")
    expect(renderWidget).toHaveBeenCalledTimes(2)
    expect(renderWidget.mock.calls[1][1]).toEqual(expect.objectContaining({ size: "compact" }))
  })
})
