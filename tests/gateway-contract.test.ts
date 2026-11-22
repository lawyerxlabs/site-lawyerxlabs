// Static contract: web /v1/ proxy target and the Tool Parse gateway network must agree.
// No containers. Cross-repo half is skipped when the sibling repo is not checked out.

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = path.resolve(import.meta.dirname, "..")
const read = (p: string) => readFileSync(p, "utf8")

describe("gateway wiring contract", () => {
  it("web /v1/ proxies to the gateway alias via the shared network", () => {
    const compose = read(path.join(root, "compose.yml"))
    const dockerfile = read(path.join(root, "Dockerfile"))
    const nginx = read(path.join(root, "nginx.conf"))

    const v1 = nginx.match(/^\s*location \^~ \/v1\/ \{([\s\S]*?)^\s*\}/m)?.[1]
    expect(v1).toBeDefined()
    const directives = v1!.split("\n").map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean)
    expect(directives).toContain("client_max_body_size 11m;")
    expect(directives).toContain("set $gateway_upstream ${NGINX_GATEWAY_UPSTREAM};")
    expect(directives).toContain("proxy_pass $gateway_upstream;")
    expect(directives).toContain("error_page 413 = @upload_too_large;")
    expect(directives).toContain("proxy_set_header Host $host;")
    expect(directives).toContain("proxy_set_header X-Real-IP $remote_addr;")
    expect(directives).toContain("proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;")
    expect(directives).toContain("proxy_set_header X-Forwarded-Proto $scheme;")
    const tooLarge = nginx.match(/^\s*location @upload_too_large \{([\s\S]*?)^\s*\}/m)?.[1]
    expect(tooLarge).toBeDefined()
    const errorDirectives = tooLarge!.split("\n").map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean)
    expect(errorDirectives).toContain("default_type application/json;")
    expect(errorDirectives).toContain("return 413 '{\"error\":{\"code\":\"too_large\",\"message\":\"Upload body exceeds the 11 MiB proxy limit\"}}';")
    expect(dockerfile).toContain("ARG NGINX_GATEWAY_UPSTREAM=http://tool-parse-gateway:8080")
    expect(compose).toMatch(/tool_parse_gateway:\s*\n\s*external: true\s*\n\s*name: tool_parse_gateway/)
  })

  it("web exact /v2/hr/packages proxies to the gateway with the shared 11m body limit and JSON 413", () => {
    const nginx = read(path.join(root, "nginx.conf"))
    const hr = nginx.match(/^\s*location = \/v2\/hr\/packages \{([\s\S]*?)^\s*\}/m)?.[1]

    expect(hr).toBeDefined()
    const directives = hr!.split("\n").map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean)
    expect(directives).toContain("client_max_body_size 11m;")
    expect(directives).toContain("error_page 413 = @upload_too_large;")
    expect(directives).toContain("set $gateway_upstream ${NGINX_GATEWAY_UPSTREAM};")
    expect(directives).toContain("proxy_pass $gateway_upstream;")
  })

  it("tool-parse declares the same network name and gateway alias", () => {
    const overlay = path.resolve(root, "../tool-parse/deploy/compose.dev.yml")
    if (!existsSync(overlay)) return
    const text = read(overlay)

    expect(text).toMatch(/gateway:\s*\n\s*external: true\s*\n\s*name: tool_parse_gateway/)
    expect(text).toMatch(/aliases:\s*\n\s*- tool-parse-gateway/)
  })
})
