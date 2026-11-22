import { describe, expect, it } from "vitest"
import { renderMarkdown } from "@/lib/markdown"

describe("renderMarkdown", () => {
  it("keeps links and images inert", () => {
    const html = renderMarkdown("[l](https://e.test) ![x](https://e.test/i.png)")
    expect(html).not.toContain("<a")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("href")
    expect(html).not.toContain("src")
    expect(html).toContain("l")
    expect(html).toContain("alt &quot;x&quot;")
  })

  it("escapes image alt payloads", () => {
    const html = renderMarkdown("![<img src=x onerror=alert(1)>](https://e.test/a.png)")
    expect(html).toContain("&lt;img")
    expect(html).not.toContain("<img")
  })
})
