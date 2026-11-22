import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

it("routes onboarding requests through the gateway with the upload limit", () => {
  const config = readFileSync("nginx.conf", "utf8")
  const block = config.match(/location \^~ \/onboard\/v1\/\s*\{([\s\S]*?)\n    \}/)?.[1]
  expect(block).toBeDefined()
  expect(block).toContain("client_max_body_size 11m")
  expect(block).toContain("proxy_pass $gateway_upstream")
  expect(block).toContain("proxy_set_header Host $host")
})
