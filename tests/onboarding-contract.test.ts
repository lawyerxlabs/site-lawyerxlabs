import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const contractPath = fileURLToPath(new URL("../docs/hr-lab/ONBOARDING-V1-API-CONTRACT.md", import.meta.url))

describe("Onboarding v1 contract", () => {
  it("preserves the public route and safety requirements", async () => {
    const contract = await readFile(contractPath, "utf8")
    expect(contract).toContain("/onboard/v1")
    expect(contract).toContain("POST /onboard/v1/sessions")
    expect(contract).toContain("/classifications")
    for (const extension of [".pdf", ".docx", ".txt"]) expect(contract).toContain(extension)
    expect(contract).toMatch(/Every run must include a job description/i)
    expect(contract).toMatch(/grounded only in uploaded source material/i)
    expect(contract).toContain("Confirm with employer")
    expect(contract).toContain("Owner: Confirm")
    expect(contract).toMatch(/Member-authenticated only/i)
    expect(contract).toContain("Cache-Control: no-store")
  })

  it("ships synthetic fixtures for the classification path", async () => {
    const dir = fileURLToPath(new URL("./fixtures/onboarding/", import.meta.url))
    const jd = await readFile(`${dir}job-description.txt`, "utf8")
    const policy = await readFile(`${dir}policy.txt`, "utf8")
    const unsupported = await readFile(`${dir}unsupported.md`, "utf8")
    expect(jd).toMatch(/Synthetic fixture/)
    expect(policy).toMatch(/Synthetic fixture/)
    expect(unsupported).toMatch(/Synthetic unsupported fixture/)
  })
})
