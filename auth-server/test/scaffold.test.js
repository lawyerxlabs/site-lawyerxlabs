import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, REQUIRED_ENV } from "../src/config.js";
import { createAuthServer } from "../src/server.js";
import http from "node:http";

const GOOD = {
  AUTH_ISSUER: "https://auth.example.test/oidc",
  AUTH_CLIENT_ID: "test-client",
  AUTH_CLIENT_SECRET: "test-client-secret-not-real",
  AUTH_ORIGINS: "https://staging.lawyerlab.ca,https://lawyerlab.ca",
  AUTH_SESSION_SECRET: "test-secret-not-real",
  AUTH_BRIDGE_SECRET: "bridge-secret-not-real",
};

test("loadConfig returns frozen config when all required vars set", () => {
  const cfg = loadConfig(GOOD);
  assert.equal(cfg.issuer, GOOD.AUTH_ISSUER);
  assert.equal(cfg.port, 7300);
  assert.ok(Object.isFrozen(cfg));
});

test("loadConfig fails closed for each missing required var", () => {
  for (const name of REQUIRED_ENV) {
    const env = { ...GOOD, [name]: "" };
    assert.throws(() => loadConfig(env), new RegExp(name), `missing ${name} must throw`);
  }
});

test("loadConfig rejects invalid port", () => {
  assert.throws(() => loadConfig({ ...GOOD, AUTH_PORT: "99999" }), /AUTH_PORT/);
});

test("health route returns 200 with no-store", async () => {
  const server = createAuthServer(loadConfig(GOOD));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal((await res.json()).ok, true);
  } finally {
    server.close();
  }
});

test("unknown route returns 404 and no session cookie", async () => {
  const server = createAuthServer(loadConfig(GOOD));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/unknown`);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("set-cookie"), null);
  } finally {
    server.close();
  }
});

test("login redirects to OIDC and sets protected transaction cookie", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return hfetch(url, options);
    return new Response(JSON.stringify({
    issuer: GOOD.AUTH_ISSUER,
    authorization_endpoint: `${GOOD.AUTH_ISSUER}/auth`,
    token_endpoint: `${GOOD.AUTH_ISSUER}/token`,
    jwks_uri: `${GOOD.AUTH_ISSUER}/jwks`,
    }), { headers: { "content-type": "application/json" } });
  };
  const server = createAuthServer(loadConfig(GOOD));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /code_challenge_method=S256/);
    assert.match(res.headers.get("set-cookie"), /auth_tx=/);
    assert.match(res.headers.get("set-cookie"), /HttpOnly/);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test("logout ends the OIDC session and clears local cookies", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return hfetch(url, options);
    return new Response(JSON.stringify({
      issuer: GOOD.AUTH_ISSUER,
      authorization_endpoint: `${GOOD.AUTH_ISSUER}/auth`,
      end_session_endpoint: `${GOOD.AUTH_ISSUER}/session/end`,
      token_endpoint: `${GOOD.AUTH_ISSUER}/token`,
      jwks_uri: `${GOOD.AUTH_ISSUER}/jwks`,
    }), { headers: { "content-type": "application/json" } });
  };
  const server = createAuthServer(loadConfig(GOOD));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const res = await hfetch(`http://127.0.0.1:${port}/api/auth/logout`, { headers: { host: "lawyerlab.ca" } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), `${GOOD.AUTH_ISSUER}/session/end?client_id=test-client&post_logout_redirect_uri=https%3A%2F%2Flawyerlab.ca%2F`);
    assert.match(res.headers.get("set-cookie"), /auth_session=; Max-Age=0/);
    assert.match(res.headers.get("set-cookie"), /auth_tx=; Max-Age=0/);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test("session rejects absent cookie without contacting provider", async () => {
  const server = createAuthServer(loadConfig(GOOD));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/session`);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { authenticated: false });
  } finally {
    server.close();
  }
});

// --- Callback / cookie integrity (#23, #24) ---
import { generateKeyPairSync, createSign, createCipheriv, randomBytes, scryptSync } from "node:crypto";

const kp = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "P-384" });
const jwk = { ...kp.publicKey.export({ format: "jwk" }), kid: "k1", use: "sig", alg: "RS256" };
const ecJwk = { ...ec.publicKey.export({ format: "jwk" }), kid: "e1", use: "sig", alg: "ES384" };
function signEs384(claims) {
  const h = b64({ alg: "ES384", kid: "e1", typ: "JWT" });
  const p = b64(claims);
  const sig = createSign("SHA384").update(`${h}.${p}`).sign({ key: ec.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${h}.${p}.${sig}`;
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function signIdToken(claims, key = kp.privateKey, kid = "k1") {
  const h = b64({ alg: "RS256", kid, typ: "JWT" });
  const p = b64(claims);
  const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(key).toString("base64url");
  return `${h}.${p}.${sig}`;
}

// undici fetch cannot override Host; loopback calls go through node:http so tests can choose the Host.
const DEFAULT_HOST = "staging.lawyerlab.ca";
function hfetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = { host: DEFAULT_HOST, ...(options.headers ?? {}) };
    const r = http.request(url, { method: options.method ?? "GET", headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) for (const x of [].concat(v)) h.append(k, x);
        resolve(new Response([204, 304].includes(res.statusCode) || (res.statusCode >= 300 && res.statusCode < 400) ? null : Buffer.concat(chunks), { status: res.statusCode, headers: h }));
      });
    });
    r.on("error", reject);
    if (options.body) r.write(options.body);
    r.end();
  });
}

// Start a server, run login to obtain a real sealed tx cookie + state + nonce.
async function startWithStubbedLogto(tokenFor, jwksFor = () => [jwk, ecJwk], config = loadConfig(GOOD), onJwks) {
  const originalFetch = globalThis.fetch;
  let captured = {};
  let jwksFetches = 0;
  globalThis.fetch = async (url, options) => {
    const u = String(url);
    if (u.startsWith("http://127.0.0.1:")) return hfetch(url, options);
    if (u.endsWith("/.well-known/openid-configuration")) return Response.json({
      issuer: GOOD.AUTH_ISSUER, authorization_endpoint: `${GOOD.AUTH_ISSUER}/auth`,
      token_endpoint: `${GOOD.AUTH_ISSUER}/token`, jwks_uri: `${GOOD.AUTH_ISSUER}/jwks`,
    });
    if (u.endsWith("/jwks")) { jwksFetches++; await onJwks?.(); return Response.json({ keys: jwksFor() }); }
    if (u.endsWith("/token")) {
      captured.body = Object.fromEntries(options.body);
      return Response.json({ id_token: tokenFor(captured) });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  const server = createAuthServer(config);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const restore = () => { globalThis.fetch = originalFetch; server.close(); };
  return { base, restore, captured, jwksFetches: () => jwksFetches };
}

function sessionCookieFrom(res) {
  const sc = res.headers.get("set-cookie") ?? "";
  return sc.split(/,(?=\s*auth_)/).map((c) => c.trim()).find((c) => c.startsWith("auth_session="))?.split(";")[0] ?? null;
}

function txFrom(res) {
  return res.headers.get("set-cookie").split(/,(?=\s*auth_)/).find((c) => c.trim().startsWith("auth_tx=")).trim().split(";")[0];
}

async function login(base, host) {
  const r = await fetch(`${base}/api/auth/login`, { redirect: "manual", headers: host ? { host } : {} });
  const loc = new URL(r.headers.get("location"));
  return { tx: txFrom(r), state: loc.searchParams.get("state"), nonce: loc.searchParams.get("nonce") };
}

const now = () => Math.floor(Date.now() / 1000);
const validClaims = (nonce) => ({ iss: GOOD.AUTH_ISSUER, aud: GOOD.AUTH_CLIENT_ID, sub: "user-1", email: "user@example.test", roles: ["lawyerlab-member"], nonce, exp: now() + 300 });

test("callback with valid signed ID token sets session cookie and redirects", async () => {
  let nonceSeen;
  const s = await startWithStubbedLogto(() => signIdToken(validClaims(nonceSeen)));
  try {
    const l = await login(s.base);
    nonceSeen = l.nonce;
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${l.state}`, { headers: { cookie: l.tx }, redirect: "manual" });
    assert.equal(cb.status, 302);
    assert.match(cb.headers.get("set-cookie"), /auth_session=/);
    assert.match(cb.headers.get("set-cookie"), /HttpOnly/);
    assert.equal(s.captured.body.code_verifier.length > 0, true);
  } finally { s.restore(); }
});

test("JWKS kid miss refetches once so a rotated key is accepted", async () => {
  let nonceSeen;
  let rotated = false;
  const rk = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rotatedJwk = { ...rk.publicKey.export({ format: "jwk" }), kid: "k2", use: "sig", alg: "RS256" };
  const signRotated = (claims) => {
    const h = b64({ alg: "RS256", kid: "k2", typ: "JWT" });
    const p = b64(claims);
    return `${h}.${p}.${createSign("RSA-SHA256").update(`${h}.${p}`).sign(rk.privateKey).toString("base64url")}`;
  };
  const s = await startWithStubbedLogto(() => (rotated ? signRotated(validClaims(nonceSeen)) : signIdToken(validClaims(nonceSeen))), () => (rotated ? [jwk, ecJwk, rotatedJwk] : [jwk, ecJwk]));
  try {
    const l1 = await login(s.base);
    nonceSeen = l1.nonce;
    assert.equal((await fetch(`${s.base}/api/auth/callback?code=c&state=${l1.state}`, { headers: { cookie: l1.tx }, redirect: "manual" })).status, 302);
    assert.equal(s.jwksFetches(), 1);
    rotated = true;
    const l2 = await login(s.base);
    nonceSeen = l2.nonce;
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${l2.state}`, { headers: { cookie: l2.tx }, redirect: "manual" });
    assert.equal(cb.status, 302);
    assert.match(cb.headers.get("set-cookie"), /auth_session=/);
    assert.equal(s.jwksFetches(), 2);
  } finally { s.restore(); }
});

test("concurrent cold callbacks share one in-flight JWKS fetch and both succeed", async () => {
  const nonces = {};
  let markStarted;
  const started = new Promise((r) => { markStarted = r; });
  let release;
  const gate = new Promise((r) => { release = r; });
  const s = await startWithStubbedLogto((c) => signIdToken(validClaims(nonces[c.body.code])), undefined, undefined, async () => { markStarted(); await gate; });
  try {
    const l1 = await login(s.base);
    const l2 = await login(s.base);
    nonces.a = l1.nonce;
    nonces.b = l2.nonce;
    const p1 = fetch(`${s.base}/api/auth/callback?code=a&state=${l1.state}`, { headers: { cookie: l1.tx }, redirect: "manual" });
    const p2 = fetch(`${s.base}/api/auth/callback?code=b&state=${l2.state}`, { headers: { cookie: l2.tx }, redirect: "manual" });
    await started;
    release();
    const [cb1, cb2] = await Promise.all([p1, p2]);
    assert.equal(cb1.status, 302);
    assert.equal(cb2.status, 302);
    assert.match(cb1.headers.get("set-cookie"), /auth_session=/);
    assert.match(cb2.headers.get("set-cookie"), /auth_session=/);
    assert.equal(s.jwksFetches(), 1);
  } finally { s.restore(); }
});

test("failed forced refresh on unknown kid keeps cached keys usable without a cold refetch", async () => {
  let nonceSeen;
  let bad = false;
  const s = await startWithStubbedLogto(() => (bad ? signIdToken(validClaims(nonceSeen), kp.privateKey, "missing-kid") : signIdToken(validClaims(nonceSeen))));
  try {
    const l1 = await login(s.base);
    nonceSeen = l1.nonce;
    assert.equal((await fetch(`${s.base}/api/auth/callback?code=c&state=${l1.state}`, { headers: { cookie: l1.tx }, redirect: "manual" })).status, 302);
    assert.equal(s.jwksFetches(), 1);
    bad = true;
    const l2 = await login(s.base);
    nonceSeen = l2.nonce;
    assert.equal((await fetch(`${s.base}/api/auth/callback?code=c&state=${l2.state}`, { headers: { cookie: l2.tx }, redirect: "manual" })).status, 502);
    assert.equal(s.jwksFetches(), 2);
    bad = false;
    const l3 = await login(s.base);
    nonceSeen = l3.nonce;
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${l3.state}`, { headers: { cookie: l3.tx }, redirect: "manual" });
    assert.equal(cb.status, 302);
    assert.match(cb.headers.get("set-cookie"), /auth_session=/);
    assert.equal(s.jwksFetches(), 2);
  } finally { s.restore(); }
});

test("unknown kid on warm cache refetches exactly once then fails (no third fetch)", async () => {
  let nonceSeen;
  let bad = false;
  const s = await startWithStubbedLogto(() => (bad ? signIdToken(validClaims(nonceSeen), kp.privateKey, "missing-kid") : signIdToken(validClaims(nonceSeen))));
  try {
    const l1 = await login(s.base);
    nonceSeen = l1.nonce;
    assert.equal((await fetch(`${s.base}/api/auth/callback?code=c&state=${l1.state}`, { headers: { cookie: l1.tx }, redirect: "manual" })).status, 302);
    assert.equal(s.jwksFetches(), 1);
    bad = true;
    const l2 = await login(s.base);
    nonceSeen = l2.nonce;
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${l2.state}`, { headers: { cookie: l2.tx }, redirect: "manual" });
    assert.equal(cb.status, 502);
    assert.equal(s.jwksFetches(), 2);
  } finally { s.restore(); }
});



test("callback rejects state mismatch without minting session", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const l = await login(s.base);
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=wrong`, { headers: { cookie: l.tx }, redirect: "manual" });
    assert.equal(cb.status, 400);
    assert.equal(cb.headers.get("set-cookie"), null);
  } finally { s.restore(); }
});

test("callback rejects ID token with wrong nonce", async () => {
  const s = await startWithStubbedLogto((c) => signIdToken(validClaims("not-the-nonce")));
  try {
    const l = await login(s.base);
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${l.state}`, { headers: { cookie: l.tx }, redirect: "manual" });
    assert.equal(cb.status, 502);
    assert.equal(cb.headers.get("set-cookie"), null);
  } finally { s.restore(); }
});

test("callback rejects ID token signed by a different key", async () => {
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const s = await startWithStubbedLogto((c) => signIdToken(validClaims(c.body.nonce ?? ""), other.privateKey));
  try {
    const l = await login(s.base);
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${l.state}`, { headers: { cookie: l.tx }, redirect: "manual" });
    assert.equal(cb.status, 502);
    assert.equal(cb.headers.get("set-cookie"), null);
  } finally { s.restore(); }
});

test("callback rejects expired ID token and wrong audience", async () => {
  for (const bad of [{ exp: now() - 3600 }, { aud: "other-client" }, { iss: "https://evil.example/oidc" }]) {
    const s = await startWithStubbedLogto((c) => signIdToken({ ...validClaims("x"), ...bad }));
    try {
      const l = await login(s.base);
      const token = signIdToken({ ...validClaims(l.nonce), ...bad });
      s.restore();
      const s2 = await startWithStubbedLogto(() => token);
      try {
        const l2 = await login(s2.base);
        const cb = await fetch(`${s2.base}/api/auth/callback?code=c&state=${l2.state}`, { headers: { cookie: l2.tx }, redirect: "manual" });
        assert.equal(cb.status, 502, JSON.stringify(bad));
        assert.equal(cb.headers.get("set-cookie"), null);
      } finally { s2.restore(); }
    } catch (e) { throw e; }
  }
});

test("tampered or foreign session cookie is treated as unauthenticated", async () => {
  const server = createAuthServer(loadConfig(GOOD));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const v of ["auth_session=AAAA.BBBB.CCCC", "auth_session=garbage", "auth_session=", "auth_tx=" + "x".repeat(10)]) {
      const res = await fetch(`${base}/api/auth/session`, { headers: { cookie: v } });
      assert.deepEqual(await res.json(), { authenticated: false }, v);
    }
  } finally { server.close(); }
});

test("transaction cookie sealed with a different secret cannot complete callback", async () => {
  const other = loadConfig({ ...GOOD, AUTH_SESSION_SECRET: "different-secret-not-real" });
  const s = await startWithStubbedLogto((c) => signIdToken(validClaims(c.nonce ?? "")));
  try {
    const l = await login(s.base);
    const foreign = createAuthServer(other);
    await new Promise((r) => foreign.listen(0, "127.0.0.1", r));
    // Replay the cookie value (sealed with GOOD secret) against a server using a different secret.
    const cb = await fetch(`http://127.0.0.1:${foreign.address().port}/api/auth/callback?code=c&state=${l.state}`, { headers: { cookie: l.tx }, redirect: "manual" });
    foreign.close();
    assert.equal(cb.status, 400);
  } finally { s.restore(); }
});

// --- Allowlist (#22/#24) ---
import fs from "node:fs";

test("loadConfig parses AUTH_ORIGINS and rejects non-https or non-origin entries", () => {
  const cfg = loadConfig({ ...GOOD, AUTH_ORIGINS: "https://a.example.test , https://b.example.test," });
  assert.deepEqual([...cfg.origins], ["https://a.example.test", "https://b.example.test"]);
  for (const bad of ["http://a.example.test", "https://a.example.test/path", "not a url", "https://a.example.test:8443/x"]) {
    assert.throws(() => loadConfig({ ...GOOD, AUTH_ORIGINS: bad }), /AUTH_ORIGINS/, bad);
  }
});

test("loadConfig defaults required roles and honors AUTH_REQUIRED_ROLES", () => {
  assert.deepEqual([...loadConfig(GOOD).requiredRoles], ["lawyerlab-member", "lawyerlab-admin"]);
  assert.deepEqual([...loadConfig({ ...GOOD, AUTH_REQUIRED_ROLES: "x-role" }).requiredRoles], ["x-role"]);
});

async function callback(claimsOverride, host = DEFAULT_HOST) {
  let nonce;
  const s = await startWithStubbedLogto(() => signIdToken({ ...validClaims(nonce), ...claimsOverride }));
  try {
    const l = await login(s.base, host);
    nonce = l.nonce;
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${l.state}`, { headers: { cookie: l.tx, host }, redirect: "manual" });
    return { cb, captured: s.captured };
  } finally { s.restore(); }
}

test("returnTo: same-origin path survives login and callback; unsafe values fall back to /playground/", async () => {
  const cases = [
    ["/playground/jobs/abc?tab=2", "/playground/jobs/abc?tab=2"],
    [undefined, "/playground/"],
    ["https://evil.example.test/", "/playground/"],
    ["//evil.example.test/x", "/playground/"],
    ["/\\evil.example.test", "/playground/"],
    ["relative/path", "/playground/"],
    ["/ok\nSet-Cookie:x", "/playground/"],
  ];
  for (const [returnTo, expected] of cases) {
    let nonce;
    const s = await startWithStubbedLogto(() => signIdToken({ ...validClaims(nonce), roles: ["lawyerlab-member"] }));
    try {
      const path = `/api/auth/login${returnTo === undefined ? "" : `?returnTo=${encodeURIComponent(returnTo)}`}`;
      const r = await fetch(`${s.base}${path}`, { redirect: "manual", headers: { host: DEFAULT_HOST } });
      const loc = new URL(r.headers.get("location"));
      nonce = loc.searchParams.get("nonce");
      const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${loc.searchParams.get("state")}`, { headers: { cookie: txFrom(r), host: DEFAULT_HOST }, redirect: "manual" });
      assert.equal(cb.status, 302, String(returnTo));
      assert.equal(cb.headers.get("location"), `https://${DEFAULT_HOST}${expected}`, String(returnTo));
    } finally { s.restore(); }
  }
});

test("role gate: member and admin roles get a session; any email is fine", async () => {
  for (const roles of [["lawyerlab-member"], ["lawyerlab-admin"], ["other", "lawyerlab-member"]]) {
    const { cb } = await callback({ roles, email: "anyone@example.test" });
    assert.equal(cb.status, 302, roles.join());
    assert.match(cb.headers.get("set-cookie") ?? "", /auth_session=/);
  }
});

test("role gate: no roles, wrong roles, or a non-array roles claim are denied with no session", async () => {
  for (const roles of [undefined, [], ["admin"], ["viewer", "parent"], "lawyerlab-member", { 0: "lawyerlab-member" }]) {
    const { cb } = await callback({ roles });
    assert.equal(cb.status, 302, JSON.stringify(roles));
    assert.equal(cb.headers.get("location"), `https://${DEFAULT_HOST}/access-pending/`);
    assert.doesNotMatch(cb.headers.get("set-cookie") ?? "", /auth_session=[^;]/);
  }
});

test("login requests openid email profile roles scopes", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const r = await fetch(`${s.base}/api/auth/login`, { redirect: "manual" });
    assert.equal(new URL(r.headers.get("location")).searchParams.get("scope"), "openid email profile roles");
  } finally { s.restore(); }
});

test("session exposes name and email from the sealed session; name is optional and trimmed", async () => {
  const named = await callback({ roles: ["lawyerlab-member"], name: "  Ada Lovelace  " });
  const namedCookie = sessionCookieFrom(named.cb);
  const unnamed = await callback({ roles: ["lawyerlab-member"], name: undefined });
  const unnamedCookie = sessionCookieFrom(unnamed.cb);
  for (const [cookie, expected] of [[namedCookie, { name: "Ada Lovelace", email: "user@example.test" }], [unnamedCookie, { name: null, email: "user@example.test" }]]) {
    const s = await startWithStubbedLogto(() => "unused");
    try {
      const body = await (await fetch(`${s.base}/api/auth/session`, { headers: { cookie } })).json();
      assert.equal(body.name, expected.name);
      assert.equal(body.email, expected.email);
      assert.equal(body.tier, "auth");
    } finally { s.restore(); }
  }
});

test("non-string or whitespace-only name claim is ignored", async () => {
  for (const name of [42, ["x"], "   "]) {
    const { cb } = await callback({ roles: ["lawyerlab-member"], name });
    assert.equal(cb.status, 302, String(name));
    const s = await startWithStubbedLogto(() => "unused");
    try {
      const body = await (await fetch(`${s.base}/api/auth/session`, { headers: { cookie: sessionCookieFrom(cb) } })).json();
      assert.equal(body.name, null, String(name));
    } finally { s.restore(); }
  }
});

test("each allowed origin gets its own redirect_uri, token redirect_uri and post-login landing", async () => {
  for (const host of ["staging.lawyerlab.ca", "lawyerlab.ca"]) {
    const s = await startWithStubbedLogto(() => signIdToken(validClaims(nonceBox.n)));
    const nonceBox = { n: undefined };
    try {
      const r = await fetch(`${s.base}/api/auth/login`, { redirect: "manual", headers: { host } });
      const loc = new URL(r.headers.get("location"));
      assert.equal(loc.searchParams.get("redirect_uri"), `https://${host}/api/auth/callback`);
      nonceBox.n = loc.searchParams.get("nonce");
      const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${loc.searchParams.get("state")}`, { headers: { cookie: txFrom(r), host }, redirect: "manual" });
      assert.equal(cb.status, 302);
      assert.equal(cb.headers.get("location"), `https://${host}/playground/`);
      assert.equal(s.captured.body.redirect_uri, `https://${host}/api/auth/callback`);
    } finally { s.restore(); }
  }
});

test("unknown or spoofed Host is rejected on login and callback", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    for (const host of ["evil.example.test", "lawyerlab.ca.evil.example.test", "staging.lawyerlab.ca:8443", ""]) {
      const r = await fetch(`${s.base}/api/auth/login`, { redirect: "manual", headers: { host } });
      assert.equal(r.status, 400, `login host=${host}`);
      assert.equal(r.headers.get("set-cookie"), null);
    }
    // x-forwarded-host must never select the origin
    const r = await fetch(`${s.base}/api/auth/login`, { redirect: "manual", headers: { host: "evil.example.test", "x-forwarded-host": "lawyerlab.ca" } });
    assert.equal(r.status, 400);
  } finally { s.restore(); }
});

test("a transaction started on one origin cannot complete on another", async () => {
  let nonce;
  const s = await startWithStubbedLogto(() => signIdToken(validClaims(nonce)));
  try {
    const l = await login(s.base, "staging.lawyerlab.ca");
    nonce = l.nonce;
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${l.state}`, { headers: { cookie: l.tx, host: "lawyerlab.ca" }, redirect: "manual" });
    assert.equal(cb.status, 400);
    assert.doesNotMatch(cb.headers.get("set-cookie") ?? "", /auth_session=/);
  } finally { s.restore(); }
});

test("session reports tier auth and admin flag from roles", async () => {
  for (const [roles, admin] of [[["lawyerlab-member"], false], [["lawyerlab-admin"], true]]) {
    const { cb } = await callback({ roles });
    const cookie = cb.headers.get("set-cookie").split(/,(?=\s*auth_)/).find((c) => c.trim().startsWith("auth_session=")).trim().split(";")[0];
    const s = await startWithStubbedLogto(() => "unused");
    try {
      const res = await fetch(`${s.base}/api/auth/session`, { headers: { cookie } });
      const body = await res.json();
      assert.equal(body.tier, "auth");
      assert.equal(body.admin, admin);
    } finally { s.restore(); }
  }
});

test("callback accepts ES384 ID token (Logto default signing alg)", async () => {
  let nonce;
  const s = await startWithStubbedLogto(() => signEs384(validClaims(nonce)));
  try {
    const l = await login(s.base);
    nonce = l.nonce;
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${l.state}`, { headers: { cookie: l.tx }, redirect: "manual" });
    assert.equal(cb.status, 302);
    assert.match(cb.headers.get("set-cookie") ?? "", /auth_session=/);
  } finally { s.restore(); }
});

// ES384 must be as strict as RS256: forged signature, alg/key-type confusion, and alg:none all fail closed.
async function expectRejected(tokenFor) {
  let nonce;
  const s = await startWithStubbedLogto(() => tokenFor(() => nonce));
  try {
    const l = await login(s.base);
    nonce = l.nonce;
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${l.state}`, { headers: { cookie: l.tx }, redirect: "manual" });
    assert.ok(cb.status >= 400, `expected rejection, got ${cb.status}`);
    assert.doesNotMatch(cb.headers.get("set-cookie") ?? "", /auth_session=/);
  } finally { s.restore(); }
}
const signEc = (header, claims, key) => {
  const h = b64(header), p = b64(claims);
  const sig = createSign("SHA384").update(`${h}.${p}`).sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${h}.${p}.${sig}`;
};

test("ES384 token signed by a different EC key is rejected", () => expectRejected((n) => {
  const other = generateKeyPairSync("ec", { namedCurve: "P-384" });
  return signEc({ alg: "ES384", kid: "e1", typ: "JWT" }, validClaims(n()), other.privateKey);
}));

test("ES384 token with tampered payload is rejected", () => expectRejected((n) => {
  const good = signEs384(validClaims(n()));
  const [h, , sig] = good.split(".");
  return `${h}.${b64({ ...validClaims(n()), email: "attacker@example.test" })}.${sig}`;
}));

test("ES384 header pointing at an RSA key (alg confusion) is rejected", () => expectRejected((n) =>
  signEc({ alg: "ES384", kid: "k1", typ: "JWT" }, validClaims(n()), ec.privateKey)));

test("alg none is rejected", () => expectRejected((n) =>
  `${b64({ alg: "none", kid: "e1", typ: "JWT" })}.${b64(validClaims(n()))}.`));

test("discovery is retried once after a transient network failure", async () => {
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return hfetch(url, options);
    calls++;
    if (calls === 1) throw new TypeError("fetch failed");
    return Response.json({ issuer: GOOD.AUTH_ISSUER, authorization_endpoint: `${GOOD.AUTH_ISSUER}/auth`, token_endpoint: `${GOOD.AUTH_ISSUER}/token`, jwks_uri: `${GOOD.AUTH_ISSUER}/jwks` });
  };
  const server = createAuthServer(loadConfig(GOOD));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, { redirect: "manual" });
    assert.equal(r.status, 302);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; server.close(); }
});

test("discovery is cached across logins and a persistent failure still fails closed", async () => {
  const originalFetch = globalThis.fetch; let calls = 0; let down = false;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return hfetch(url, options);
    calls++;
    if (down) throw new TypeError("fetch failed");
    return Response.json({ issuer: GOOD.AUTH_ISSUER, authorization_endpoint: `${GOOD.AUTH_ISSUER}/auth`, token_endpoint: `${GOOD.AUTH_ISSUER}/token`, jwks_uri: `${GOOD.AUTH_ISSUER}/jwks` });
  };
  const server = createAuthServer(loadConfig(GOOD));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/auth/login`, { redirect: "manual" })).status, 302);
    assert.equal((await fetch(`${base}/api/auth/login`, { redirect: "manual" })).status, 302);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; server.close(); }
  // fresh server/config, provider down on both attempts -> 502, no cookie
  down = true; calls = 0; globalThis.fetch = async (url, options) => { if (String(url).startsWith("http://127.0.0.1:")) return hfetch(url, options); calls++; throw new TypeError("fetch failed"); };
  const s2 = createAuthServer(loadConfig(GOOD));
  await new Promise((r) => s2.listen(0, "127.0.0.1", r));
  try {
    const r = await fetch(`http://127.0.0.1:${s2.address().port}/api/auth/login`, { redirect: "manual" });
    assert.equal(r.status, 502);
    assert.equal(r.headers.get("set-cookie"), null);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; s2.close(); }
});

// --- Internal bridge identity (Tool Parse gateway) ---
// Mirrors server.js seal() (same key derivation and format) so tests can mint session cookies.
function seal(value, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(secret, "lawyerlab-auth-cookie-v1", 32), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}
const sessionCookie = (value) => `auth_session=${encodeURIComponent(seal(value, GOOD.AUTH_SESSION_SECRET))}`;

test("loadConfig requires AUTH_BRIDGE_SECRET", () => {
  assert.ok(REQUIRED_ENV.includes("AUTH_BRIDGE_SECRET"));
  assert.throws(() => loadConfig({ ...GOOD, AUTH_BRIDGE_SECRET: "" }), /AUTH_BRIDGE_SECRET/);
});

test("internal identity: missing or wrong bridge secret is 403 and reveals nothing", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const cookie = sessionCookie({ sub: "user-1", exp: Date.now() + 60000 });
    for (const extra of [{}, { "x-lawyerlab-bridge-secret": "wrong" }, { "x-lawyerlab-bridge-secret": "" }]) {
      const r = await fetch(`${s.base}/internal/auth/identity`, { headers: { cookie, ...extra } });
      assert.equal(r.status, 403, JSON.stringify(extra));
      assert.deepEqual(await r.json(), { authenticated: false });
    }
  } finally { s.restore(); }
});

test("internal identity: valid session returns only authenticated and sub", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const cookie = sessionCookie({ sub: "user-1", email: "user@example.test", roles: ["lawyerlab-admin"], exp: Date.now() + 60000 });
    const r = await fetch(`${s.base}/internal/auth/identity`, { headers: { cookie, "x-lawyerlab-bridge-secret": GOOD.AUTH_BRIDGE_SECRET } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(await r.json(), { authenticated: true, sub: "user-1" });
  } finally { s.restore(); }
});

test("malformed session cookie is unauthenticated on both session endpoints", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const session = await fetch(`${s.base}/api/auth/session`, { headers: { cookie: "auth_session=%" } });
    assert.equal(session.status, 401);
    assert.deepEqual(await session.json(), { authenticated: false });

    const identity = await fetch(`${s.base}/internal/auth/identity`, {
      headers: { cookie: "auth_session=%", "x-lawyerlab-bridge-secret": GOOD.AUTH_BRIDGE_SECRET },
    });
    assert.equal(identity.status, 401);
    assert.deepEqual(await identity.json(), { authenticated: false });
  } finally { s.restore(); }
});

test("internal identity: absent, tampered, expired, or sub-less session is 401", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const cookies = [undefined, "auth_session=AAAA.BBBB.CCCC", sessionCookie({ sub: "user-1", exp: Date.now() - 1000 }), sessionCookie({ exp: Date.now() + 60000 })];
    for (const cookie of cookies) {
      const headers = { "x-lawyerlab-bridge-secret": GOOD.AUTH_BRIDGE_SECRET, ...(cookie ? { cookie } : {}) };
      const r = await fetch(`${s.base}/internal/auth/identity`, { headers });
      assert.equal(r.status, 401, cookie);
      assert.deepEqual(await r.json(), { authenticated: false });
    }
  } finally { s.restore(); }
});

test("browser /api/auth/session still returns full profile fields", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const cookie = sessionCookie({ sub: "user-1", email: "user@example.test", name: "Ada", roles: ["lawyerlab-admin"], exp: Date.now() + 60000 });
    const r = await fetch(`${s.base}/api/auth/session`, { headers: { cookie } });
    assert.deepEqual(await r.json(), { authenticated: true, sub: "user-1", email: "user@example.test", name: "Ada", tier: "auth", admin: true });
  } finally { s.restore(); }
});

// --- Email-first POST login (Logto first_screen handoff) ---
const FORM = "application/x-www-form-urlencoded";
const postLogin = (base, fields, headers = {}) => hfetch(`${base}/api/auth/login`, { method: "POST", headers: { host: DEFAULT_HOST, "content-type": FORM, ...headers }, body: new URLSearchParams(fields).toString() });
const authParams = (location) => Object.fromEntries(new URL(location).searchParams);

test("POST login sign-in: sends login_hint, identifier and first_screen=identifier:sign-in with PKCE", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const r = await postLogin(s.base, { email: "  Ada@Example.test ", intent: "sign-in", returnTo: "/playground/jobs/abc" });
    assert.equal(r.status, 302);
    const p = authParams(r.headers.get("location"));
    assert.equal(p.login_hint, "Ada@Example.test");
    assert.equal(p.identifier, "email");
    assert.equal(p.first_screen, "identifier:sign-in");
    assert.equal(p.prompt, "login");
    assert.equal(p.code_challenge_method, "S256");
    assert.ok(p.state && p.nonce && p.code_challenge);
    assert.match(r.headers.get("set-cookie"), /auth_tx=/);
  } finally { s.restore(); }
});

test("POST login register: first_screen=identifier:register", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const r = await postLogin(s.base, { email: "new@example.test", intent: "register" });
    assert.equal(r.status, 302);
    assert.equal(authParams(r.headers.get("location")).first_screen, "identifier:register");
  } finally { s.restore(); }
});

test("POST login: invalid email redirects to same-origin login form with error, no authorize call", async () => {
  const bad = ["", "no-at-sign", "a@b@c.test", "@x.test", "x@", "a b@x.test", "a\n@x.test", `${"a".repeat(250)}@x.test`];
  const s = await startWithStubbedLogto(() => "unused");
  try {
    for (const email of bad) {
      const r = await postLogin(s.base, { email, intent: "register" });
      assert.equal(r.status, 302, JSON.stringify(email));
      assert.equal(r.headers.get("location"), `https://${DEFAULT_HOST}/login/?mode=register&error=invalid-email`, JSON.stringify(email));
      assert.doesNotMatch(r.headers.get("set-cookie") ?? "", /auth_tx=[^;]/);
    }
  } finally { s.restore(); }
});

test("POST login: caller cannot inject authorization params; only server-selected ones are sent", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const r = await postLogin(s.base, { email: "a@example.test", intent: "sign-in", scope: "admin", redirect_uri: "https://evil.example.test/cb", response_type: "token", prompt: "none", first_screen: "identifier:register", login_hint_extra: "x" });
    const url = new URL(r.headers.get("location"));
    assert.deepEqual([...url.searchParams.keys()].sort(), ["client_id", "code_challenge", "code_challenge_method", "first_screen", "identifier", "login_hint", "nonce", "prompt", "redirect_uri", "response_type", "scope", "state"]);
    assert.equal(url.searchParams.get("first_screen"), "identifier:sign-in");
    assert.equal(url.searchParams.get("scope"), "openid email profile roles");
    assert.equal(url.searchParams.get("redirect_uri"), `https://${DEFAULT_HOST}/api/auth/callback`);
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("prompt"), "login");
  } finally { s.restore(); }
});

test("POST login: unsafe returnTo falls back to /playground/; bad intent, wrong type, oversize, unknown origin are rejected", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const ok = await postLogin(s.base, { email: "a@example.test", intent: "sign-in", returnTo: "https://evil.example.test/" });
    assert.equal(ok.status, 302);
    assert.equal(authParams(ok.headers.get("location")).login_hint, "a@example.test");
    assert.equal((await postLogin(s.base, { email: "a@example.test", intent: "admin" })).status, 400);
    const wrongType = await postLogin(s.base, { email: "a@example.test", intent: "sign-in" }, { "content-type": "application/json" });
    assert.equal(wrongType.status, 400);
    const big = await postLogin(s.base, { email: "a@example.test", intent: "sign-in", pad: "x".repeat(8192) });
    assert.equal(big.status, 413);
    assert.equal((await big.json()).error, "payload_too_large");
    const unknown = await postLogin(s.base, { email: "a@example.test", intent: "sign-in" }, { host: "evil.example.test" });
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).error, "unknown_origin");
  } finally { s.restore(); }
});

test("GET login stays compatible: no email-first params are added", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const r = await fetch(`${s.base}/api/auth/login?email=a@example.test&first_screen=identifier:register`, { redirect: "manual", headers: { host: DEFAULT_HOST } });
    const p = authParams(r.headers.get("location"));
    assert.equal(p.login_hint, undefined);
    assert.equal(p.identifier, undefined);
    assert.equal(p.first_screen, undefined);
    assert.equal(r.status, 302);
  } finally { s.restore(); }
});

test("role-denied callback clears auth_tx and any existing auth_session, issues no session", async () => {
  let nonce;
  const s = await startWithStubbedLogto(() => signIdToken({ ...validClaims(nonce), roles: ["viewer"] }));
  try {
    const l = await login(s.base);
    nonce = l.nonce;
    const cb = await fetch(`${s.base}/api/auth/callback?code=c&state=${l.state}`, { headers: { cookie: `${l.tx}; ${sessionCookie({ sub: "old", exp: Date.now() + 60000 })}`, host: DEFAULT_HOST }, redirect: "manual" });
    assert.equal(cb.status, 302);
    assert.equal(cb.headers.get("location"), `https://${DEFAULT_HOST}/access-pending/`);
    const setCookie = cb.headers.get("set-cookie");
    assert.match(setCookie, /auth_tx=; Max-Age=0/);
    assert.match(setCookie, /auth_session=; Max-Age=0/);
    assert.doesNotMatch(setCookie, /auth_session=[^;]/);
  } finally { s.restore(); }
});

// --- POST login body bounds and aborted requests (raw sockets: undici cannot send a mismatched Content-Length or abort mid-body) ---
import net from "node:net";
function rawPost(port, { headers, chunks = [], abortAfter = false }) {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1");
    let out = "";
    sock.on("data", (d) => { out += d; });
    sock.on("error", () => {});
    sock.on("close", () => resolve(out));
    sock.write(`POST /api/auth/login HTTP/1.1\r\nHost: ${DEFAULT_HOST}\r\nContent-Type: ${FORM}\r\n${headers}\r\n`);
    for (const c of chunks) sock.write(c);
    if (abortAfter) setTimeout(() => sock.destroy(), 50);
    else setTimeout(() => sock.end(), 300);
  });
}
const healthy = async (base) => assert.equal((await fetch(`${base}/api/auth/health`)).status, 200);

test("POST login: declared Content-Length over the limit is rejected before the body is read", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const out = await rawPost(Number(new URL(s.base).port), { headers: "Content-Length: 99999\r\n", chunks: [] });
    assert.match(out, /^HTTP\/1\.1 413 /);
    assert.doesNotMatch(out, /auth_tx=|auth_session=/);
    await healthy(s.base);
  } finally { s.restore(); }
});

test("POST login: streamed body over the limit stops with 413, no cookie, server stays healthy", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const big = "x".repeat(5000);
    const out = await rawPost(Number(new URL(s.base).port), { headers: "Transfer-Encoding: chunked\r\n", chunks: [`${(5000).toString(16)}\r\n${big}\r\n0\r\n\r\n`] });
    assert.match(out, /^HTTP\/1\.1 413 /);
    assert.doesNotMatch(out, /auth_tx=|auth_session=/);
    await healthy(s.base);
  } finally { s.restore(); }
});

test("POST login: aborted mid-body request emits no cookie and does not break the server", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const out = await rawPost(Number(new URL(s.base).port), { headers: "Content-Length: 200\r\n", chunks: ["email=a%40example.test"], abortAfter: true });
    assert.doesNotMatch(out, /auth_tx=|auth_session=/);
    await healthy(s.base);
    const r = await postLogin(s.base, { email: "a@example.test", intent: "sign-in" });
    assert.equal(r.status, 302);
  } finally { s.restore(); }
});

test("POST login: media type matches case-insensitively and ignores parameters", async () => {
  const s = await startWithStubbedLogto(() => "unused");
  try {
    const r = await postLogin(s.base, { email: "a@example.test", intent: "sign-in" }, { "content-type": "Application/X-WWW-Form-Urlencoded; charset=UTF-8" });
    assert.equal(r.status, 302);
  } finally { s.restore(); }
});
