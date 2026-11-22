// #7 browser checks that need a real Turnstile pass: upload -> result -> read-once -> delete, and cross-identity isolation.
// Run: xvfb-run -a npm run e2e:upload   (E2E_BASE_URL defaults to the local stack on :7200; use https://lawyerlab.ca for production)
// Plain node, not the Playwright runner: Turnstile never verifies inside the runner (cause not found), but does here.
// Synthetic fixture only. Cross-identity = two anonymous browser contexts; signed-in member-vs-member is not covered.
import assert from "node:assert/strict"
import { chromium } from "@playwright/test"

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:7200"
const FIXTURE = "tests/fixtures/synthetic-redaction.pdf"
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: false,
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
})
const newPage = async () => (await browser.newContext({ baseURL: base })).newPage()
const status = (p, path, method = "GET") => p.evaluate(async ([u, m]) => (await fetch(u, { method: m })).status, [path, method])

async function upload(page) {
  await page.goto("/mvp/", { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(5000) // Turnstile stays on "Verifying…" if the file is chosen sooner
  await page.setInputFiles("input[type=file]", FIXTURE)
  const submit = page.locator("button.submit-button")
  await submit.waitFor()
  for (let i = 0; i < 60 && (await submit.isDisabled()); i++) await page.waitForTimeout(1000)
  assert.equal(await submit.isDisabled(), false, "Turnstile did not verify (run headed under xvfb-run)")
  const posted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/v1/jobs")
  await submit.click()
  const res = await posted
  assert.equal(res.status(), 202, "upload")
  return (await res.json()).job_id
}

const download = (p) => p.getByRole("button", { name: "Download working copy" }).waitFor({ timeout: 60_000 })

try {
  console.log("flow: upload, read-once, delete")
  const page = await newPage()
  const id = await upload(page)
  await download(page)
  assert.deepEqual(await Promise.all(["markdown", "report"].map((k) => status(page, `/v1/jobs/${id}/result/${k}`))), [404, 404], "read-once")
  await page.getByRole("button", { name: "Delete output" }).first().click()
  await page.getByRole("button", { name: "Delete output" }).last().click()
  await page.getByRole("button", { name: "Download working copy" }).waitFor({ state: "detached" })
  assert.equal(await page.getByRole("alert").count(), 0, "delete left an error showing")

  console.log("cross-identity: other context cannot read, probe or delete")
  const a = await newPage()
  const b = await newPage()
  await b.goto("/mvp/", { waitUntil: "domcontentloaded" })
  const jobA = await upload(a)
  for (const [path, method] of [[`/v1/jobs/${jobA}`, "GET"], [`/v1/jobs/${jobA}/result/markdown`, "GET"], [`/v1/jobs/${jobA}/result/report`, "GET"], [`/v1/jobs/${jobA}`, "DELETE"]]) {
    assert.ok([403, 404].includes(await status(b, path, method)), `${method} ${path.replace(jobA, ":id")} as other identity`)
  }
  assert.equal(await status(a, `/v1/jobs/${jobA}`), 200, "owner job survived the other identity's attempts")
  await download(a)
  await status(a, `/v1/jobs/${jobA}`, "DELETE")
  console.log("PASS")
} finally {
  await browser.close()
}
