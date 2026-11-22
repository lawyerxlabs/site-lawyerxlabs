import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

// #7: WCAG 2.1 A/AA scan of each public page. The Cloudflare iframe is third-party and excluded.
for (const path of ["/", "/mvp/", "/faq/", "/privacy/", "/terms/", "/commitments/", "/login/", "/playground/"]) {
  test(`no WCAG A/AA violations on ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" })
    await page.locator("main, h1").first().waitFor()
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .exclude("iframe")
      .analyze()
    expect(violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(" ")}`)).toEqual([])
  })
}
