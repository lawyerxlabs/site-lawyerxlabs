import { defineConfig } from "@playwright/test"

// Runs against the production-like local stack (deploy/unified web on :7200) or E2E_BASE_URL.
// Turnstile only completes in headed Chrome: use `xvfb-run -a npm run e2e` for the upload specs.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:7200",
    headless: false,
    launchOptions: { executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"] },
  },
})
