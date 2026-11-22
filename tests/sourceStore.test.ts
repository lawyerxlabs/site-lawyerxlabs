import { describe, expect, it } from "vitest"
import { clearSource, getSource, setSource } from "@/lib/sourceStore"

const file = new File([new Uint8Array([1, 2, 3])], "source.pdf", { type: "application/pdf" })
const other = new File([new Uint8Array([4, 5])], "other.txt", { type: "text/plain" })
const replacement = new File([new Uint8Array([9, 9])], "source.pdf", { type: "application/pdf" })

describe("sourceStore", () => {
  it("returns undefined before set", () => {
    expect(getSource("a")).toBeUndefined()
  })

  it("set then get returns same File", () => {
    setSource("a", file)
    expect(getSource("a")).toBe(file)
  })

  it("set again for same jobId replaces", () => {
    setSource("a", file)
    setSource("a", replacement)
    expect(getSource("a")).toBe(replacement)
  })

  it("clear removes", () => {
    setSource("a", file)
    clearSource("a")
    expect(getSource("a")).toBeUndefined()
  })

  it("clear of unknown id is a no-op", () => {
    expect(() => clearSource("zzz")).not.toThrow()
    expect(getSource("zzz")).toBeUndefined()
  })

  it("ids are independent", () => {
    setSource("b", file)
    setSource("c", other)
    expect(getSource("b")).toBe(file)
    expect(getSource("c")).toBe(other)
  })

  it("evicts the oldest-unused entry once the cap is exceeded", () => {
    const d = new File([new Uint8Array([7])], "d.pdf", { type: "application/pdf" })
    const e = new File([new Uint8Array([8])], "e.pdf", { type: "application/pdf" })
    setSource("a", file)
    setSource("b", file)
    setSource("c", file)
    setSource("d", d)
    setSource("e", e)
    expect(getSource("a")).toBeUndefined()
    expect(getSource("b")).toBeUndefined()
    expect(getSource("c")).toBeUndefined()
    expect(getSource("d")).toBe(d)
    expect(getSource("e")).toBe(e)
  })

  it("keeps exactly the two most recent entries when a third is stored", () => {
    setSource("x", file)
    setSource("y", other)
    setSource("z", replacement)
    expect(getSource("x")).toBeUndefined()
    expect(getSource("y")).toBe(other)
    expect(getSource("z")).toBe(replacement)
  })

  it("promotes recency on get so eviction follows use, not insertion", () => {
    const b = new File([new Uint8Array([2])], "b.pdf", { type: "application/pdf" })
    const c = new File([new Uint8Array([3])], "c.pdf", { type: "application/pdf" })
    setSource("a", file)
    setSource("b", b)
    getSource("a")
    setSource("c", c)
    expect(getSource("b")).toBeUndefined()
    expect(getSource("a")).toBe(file)
    expect(getSource("c")).toBe(c)
  })
})
