import "@testing-library/jest-dom/vitest"
import { configure } from "@testing-library/react"

// Default 1s flakes when 57 jsdom workers compete for CPU.
configure({ asyncUtilTimeout: 5000 })

// jsdom has no matchMedia; FileIntake reads the 420px breakpoint on mount. Tests override per case.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }),
  })
}

// pdfjs-dist 6 calls Uint8Array.prototype.toHex in its worker; Node 24 lacks it (test runtime only).
if (!("toHex" in Uint8Array.prototype)) {
  Object.defineProperty(Uint8Array.prototype, "toHex", { configurable: true, value(this: Uint8Array) { return Array.from(this, (b) => b.toString(16).padStart(2, "0")).join("") } })
}
