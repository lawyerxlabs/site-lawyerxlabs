// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { CATALOG, WORKFLOWS, getRoutableWorkflow, getWorkflow } from "@/lib/workflows"
import { SURFACES, applySurfaceTheme, resolveSurface } from "@/surface"

afterEach(() => {
  document.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove())
})

describe("surface config", () => {
  it("defaults to lawyerlab and lists all existing catalog workflows", () => {
    expect(resolveSurface(undefined)).toBe(SURFACES.lawyerlab)
    expect(WORKFLOWS.map((w) => w.id)).toEqual(CATALOG.map((w) => w.id))
    expect(CATALOG.map((w) => w.id)).toContain("hr-hiring")
    expect(SURFACES["signal-lawyers"].workflows).not.toContain("hr-hiring")
  })

  it("agreement-review is catalogued but disabled until backend activation", () => {
    expect(CATALOG.find((w) => w.id === "agreement-review")?.disabled).toBe(true)
    expect(getRoutableWorkflow("agreement-review")).toBeUndefined()
  })

  it("rejects an unknown surface id rather than defaulting", () => {
    expect(() => resolveSurface("nope")).toThrow(/Unknown VITE_SURFACE/)
  })

  it("every surface lists only catalog workflows", () => {
    const ids = new Set(CATALOG.map((w) => w.id))
    for (const s of Object.values(SURFACES)) for (const id of s.workflows) expect(ids.has(id)).toBe(true)
  })

  it("signal-lawyers serves the full sidebar set", () => {
    expect(SURFACES["signal-lawyers"].workflows).toEqual(["docalias", "term-isolation", "transaction-review", "contract-review", "case-analysis", "agreement-review"])
  })

  it("applies the surface id without overriding tokens when no theme exists", () => {
    const root = document.createElement("html")
    applySurfaceTheme(SURFACES.lawyerlab, root)
    expect(root.dataset.surface).toBe("lawyerlab")
    expect(root.style.length).toBe(0)
    expect(document.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe("/lawyerlab-logo-mark.svg")
    document.querySelector('link[rel="icon"]')?.remove()
    applySurfaceTheme(SURFACES["signal-lawyers"], root)
    expect(document.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe("/signal-logo-mark.svg")
    document.querySelector('link[rel="icon"]')?.remove()
  })

  it("updates a pre-existing icon link instead of adding a second one", () => {
    const existing = document.createElement("link")
    existing.rel = "icon"
    existing.href = "/old.ico"
    document.head.appendChild(existing)
    applySurfaceTheme(SURFACES["signal-lawyers"], document.createElement("html"))
    const icons = document.querySelectorAll('link[rel="icon"]')
    expect(icons).toHaveLength(1)
    expect(icons[0]).toBe(existing)
    expect(existing.getAttribute("href")).toBe("/signal-logo-mark.svg")
  })

  it("themes every shared token for signal-lawyers", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/tokens.css`, "utf8")
    const tokens = [...css.matchAll(/(--ll-[a-z0-9-]+)\s*:/g)].map((match) => match[1])
    const theme = SURFACES["signal-lawyers"].theme
    expect(new Set(Object.keys(theme ?? {}))).toEqual(new Set(tokens))

    const root = document.createElement("html")
    applySurfaceTheme(SURFACES["signal-lawyers"], root)
    expect(root.dataset.surface).toBe("signal-lawyers")
    for (const token of tokens) expect(root.style.getPropertyValue(token)).toBe(theme?.[token as keyof typeof theme])
  })

  it("does not resolve retired transaction intake", () => {
    expect(getWorkflow("transaction-intake")).toBeUndefined()
  })
})

describe("signal-lawyers build", () => {

  it("signal-lawyers provides the approved Before You Sign copy pack", () => {
    const s = SURFACES["signal-lawyers"]
    expect(s.copy.workflowEyebrow).toBe("Before You Sign")
    expect(s.copy.disclaimer).toContain("does not replace legal advice")
    expect(JSON.stringify(s)).not.toContain("LawyerLab")
  })
  it("serves its configured workflows; unlisted ids resolve unknown", async () => {
    vi.resetModules()
    vi.stubEnv("VITE_SURFACE", "signal-lawyers")
    const w = await import("@/lib/workflows")
    expect(w.WORKFLOWS.map((x) => x.id)).toEqual(["docalias", "contract-review", "transaction-review", "case-analysis", "agreement-review", "term-isolation"])
    expect(w.getRoutableWorkflow("transaction-intake")).toBeUndefined()
    expect(w.getWorkflow("not-a-workflow")).toBeUndefined()
    vi.unstubAllEnvs()
  })
})
