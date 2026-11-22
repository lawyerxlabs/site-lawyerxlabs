import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { applySurfaceMeta } from "../vite.config"

const pages = [
  { file: "index.html", title: "LawyerLabs — AI tools for better decisions", canonical: "https://lawyerxlabs.com/", image: "share-lawyerlab.png" },
  { file: "playground/index.html", title: "Playground — LawyerLab", canonical: "https://lawyerlab.ca/playground/", image: "share-playground.png" },
]

describe("share metadata", () => {
  it.each(pages)("keeps $file metadata and image dimensions", ({ file, title, canonical, image }) => {
    const html = readFileSync(file, "utf8")
    expect(html).toContain(`<title>${title}</title>`)
    expect(html).toContain(`<link rel="canonical" href="${canonical}" />`)
    expect(html).toContain(`https://${file === "index.html" ? "lawyerxlabs.com" : "lawyerlab.ca"}/${image}`)
    expect(html).toContain('content="1200"')
    expect(html).toContain('content="630"')
    const png = readFileSync(`public/${image}`)
    expect(png.toString("ascii", 1, 4)).toBe("PNG")
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  })

  it("keeps LawyerLabs head metadata and routes default metadata untouched", () => {
    const html = readFileSync("index.html", "utf8")
    expect(applySurfaceMeta(html, "lawyerlab")).toBe(html)
    expect(applySurfaceMeta(html, "")).toBe(html)
  })

  it.each([
    { file: "index.html", canonical: "https://lab.signallawyers.ca/" },
    { file: "playground/index.html", canonical: "https://lab.signallawyers.ca/playground/" },
  ])("rewrites signal-lawyers $file head to its own host and image", ({ file, canonical }) => {
    const signal = applySurfaceMeta(readFileSync(file, "utf8"), "signal-lawyers")
    expect(signal).not.toContain("LawyerLab")
    expect(signal).not.toContain("lawyerlab.ca")
    expect(signal).toContain("https://lab.signallawyers.ca/share-signal.png")
    expect(signal).toContain(`<link rel="canonical" href="${canonical}" />`)
    expect(signal).toContain(`<meta property="og:url" content="${canonical}" />`)
    expect(signal).toContain('<meta property="og:site_name" content="Signal Lawyers" />')
    expect(signal).toContain("Know what you are signing")
    expect(signal).toContain("Signal Lawyers workflows require sign-in.")
    expect(signal).not.toContain("Document Alias")
    expect(signal).not.toContain("without sign-in")
    expect(signal).not.toContain("Sign in to use Signal Lawyers workflows")
    expect(signal).toMatch(/<title>Signal Lawyers — /)
  })

  it("ships a 1200x630 signal share image", () => {
    const png = readFileSync("public/share-signal.png")
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  })
})
