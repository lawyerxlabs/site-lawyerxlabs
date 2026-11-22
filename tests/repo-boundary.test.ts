// #7: LawyerLab talks to tool-parse over HTTP /v1 only; no source, tokens or deps cross the repo boundary.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = path.resolve(import.meta.dirname, "..")
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css|html)$/.test(n) ? [p] : []
  })

describe("repo boundary", () => {
  const src = files(path.join(root, "src"))
  it("src imports nothing from the tool-parse repo", () => {
    const bad = src.filter((f) => /from\s+["'][^"']*(tool-parse|\.\.\/\.\.\/)[^"']*["']/.test(readFileSync(f, "utf8")))
    expect(bad).toEqual([])
  })
  it("src does not reuse the tool-parse --lx-* design tokens", () => {
    expect(src.filter((f) => /--lx-/.test(readFileSync(f, "utf8")))).toEqual([])
  })
  it("package.json does not depend on tool-parse", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(Object.keys(deps).concat(Object.values<string>(deps)).filter((s) => /tool-parse/.test(s))).toEqual([])
  })
})
