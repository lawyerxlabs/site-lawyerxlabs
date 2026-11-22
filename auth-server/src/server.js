import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes, scryptSync, timingSafeEqual, verify } from "node:crypto";
import { loadConfig } from "./config.js";

const TX_COOKIE = "auth_tx";
const SESSION_COOKIE = "auth_session";
const TX_MAX_AGE = 600;
const SESSION_MAX_AGE = 3600;
const COOKIE_FLAGS = "; Path=/; HttpOnly; Secure; SameSite=Lax";

function seal(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
function open(value, key) {
  try {
    const [iv, tag, ciphertext] = value.split(".");
    if (!iv || !tag || !ciphertext) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8"));
  } catch { return null; }
}
function requestCookie(req, name) {
  const item = (req.headers.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!item) return null;
  try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return null; }
}
// Origin comes from the Host header (nginx forwards $host) and must be allowlisted; never from client-settable forwarding headers.
function originOf(req, config) {
  const origin = `https://${(req.headers.host ?? "").toLowerCase()}`;
  return config.origins.has(origin) ? origin : null;
}
// Hash both sides so timingSafeEqual sees equal lengths and the secret length does not leak.
function bridgeAuthorized(req, config) {
  const given = req.headers["x-lawyerlab-bridge-secret"];
  if (typeof given !== "string") return false;
  const digest = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(config.bridgeSecret));
}
function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
function redirect(res, location, cookies = []) {
  res.writeHead(302, { location, "cache-control": "no-store", "set-cookie": cookies });
  res.end();
}
// Same-origin absolute path only: single leading slash, printable ASCII, no backslash (browsers read "/\host" as "//host").
function safeReturnTo(value) {
  return typeof value === "string" && value.length <= 2048 && /^\/(?![/\\])[\x21-\x7e]*$/.test(value) ? value : null;
}
const LOGIN_BODY_MAX = 4096;
const FORM_TYPE = "application/x-www-form-urlencoded";
// Returns the body text; null when over limit (iteration stops, stream is destroyed); undefined when the request stream errors or aborts.
async function readBody(req, limit) {
  let size = 0; const chunks = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) return null;
      chunks.push(chunk);
    }
  } catch { return undefined; }
  return Buffer.concat(chunks).toString("utf8");
}
// Plausible, not RFC-complete: one @, nonempty sides, no whitespace or control characters.
function validEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (!email || email.length > 254 || /[\s\x00-\x1f\x7f]/.test(email)) return null;
  const parts = email.split("@");
  return parts.length === 2 && parts[0] && parts[1] ? email : null;
}
function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url"), state: randomBytes(32).toString("base64url"), nonce: randomBytes(32).toString("base64url") };
}
const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const discoveryCache = new WeakMap();
// config -> Map<jwksUri, { keys, exp, inflight }>; per-config so two configs never share keys.
const jwksStates = new WeakMap();
function jwksState(config, jwksUri) {
  if (!jwksStates.has(config)) jwksStates.set(config, new Map());
  const byUri = jwksStates.get(config);
  if (!byUri.has(jwksUri)) byUri.set(jwksUri, { keys: null, exp: 0, inflight: null });
  return byUri.get(jwksUri);
}
async function fetchDiscovery(config) {
  const response = await fetch(`${config.issuer}/.well-known/openid-configuration`, { headers: { "user-agent": "lawyerlab-auth/1.0" }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("OIDC discovery failed");
  const document = await response.json();
  if (document.issuer !== config.issuer || !document.authorization_endpoint || !document.token_endpoint || !document.jwks_uri) throw new Error("OIDC discovery mismatch");
  return document;
}
// Cached (a transient network blip must not fail every login) and retried once.
async function discovery(config) {
  const hit = discoveryCache.get(config);
  if (hit && hit.exp > Date.now()) return hit.document;
  let document;
  try { document = await fetchDiscovery(config); } catch { document = await fetchDiscovery(config); }
  discoveryCache.set(config, { document, exp: Date.now() + DISCOVERY_TTL_MS });
  return document;
}
// One in-flight fetch per config+URI: concurrent cold misses and refreshes share it. Failure clears it and leaves the cached keys untouched.
function fetchJwks(config, jwksUri) {
  const state = jwksState(config, jwksUri);
  state.inflight ??= (async () => {
    const response = await fetch(jwksUri, { headers: { "user-agent": "lawyerlab-auth/1.0" }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("JWKS fetch failed");
    state.keys = (await response.json()).keys;
    state.exp = Date.now() + DISCOVERY_TTL_MS;
    return state.keys;
  })().finally(() => { state.inflight = null; });
  return state.inflight;
}
function jsonPart(value) { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
async function verifyIdToken(token, config, expectedNonce, jwksUri) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid ID token");
  const header = jsonPart(parts[0]);
  const payload = jsonPart(parts[1]);
  const ALGS = { RS256: { kty: "RSA", hash: "RSA-SHA256" }, ES384: { kty: "EC", hash: "SHA384", dsaEncoding: "ieee-p1363" } };
  const alg = ALGS[header.alg];
  if (!alg || typeof header.kid !== "string") throw new Error("unsupported ID token");
  const findKey = (keys) => keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === alg.kty);
  const state = jwksState(config, jwksUri);
  let jwk = state.exp > Date.now() ? findKey(state.keys) : undefined;
  // Refetch on kid miss so a rotated signing key is picked up before failing (one refetch per miss).
  if (!jwk) jwk = findKey(await fetchJwks(config, jwksUri));
  if (!jwk) throw new Error("signing key not found");
  const valid = verify(alg.hash, Buffer.from(`${parts[0]}.${parts[1]}`), { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: alg.dsaEncoding }, Buffer.from(parts[2], "base64url"));
  if (!valid || payload.iss !== config.issuer || payload.aud !== config.clientId || payload.nonce !== expectedNonce) throw new Error("invalid ID token claims");
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000) - 60) throw new Error("expired ID token");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("missing subject");
  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 200) : "";
  return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : null, name: name || null, roles: Array.isArray(payload.roles) ? payload.roles.filter((r) => typeof r === "string") : [] };
}
async function exchangeCode(config, document, code, verifier, nonce, redirectUri) {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(document.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}`, "user-agent": "lawyerlab-auth/1.0" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("token exchange failed");
  const tokens = await response.json();
  if (typeof tokens.id_token !== "string") throw new Error("missing ID token");
  return verifyIdToken(tokens.id_token, config, nonce, document.jwks_uri);
}

export function createAuthServer(config) {
  const cookieKey = scryptSync(config.sessionSecret, "lawyerlab-auth-cookie-v1", 32);
  // `extra` is server-selected only; callers never pass through client auth params.
  async function startLogin(res, origin, returnTo, extra) {
    const document = await discovery(config); const values = pkce();
    const authorize = new URL(document.authorization_endpoint);
    authorize.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${origin}/api/auth/callback`, response_type: "code", scope: "openid email profile roles", state: values.state, nonce: values.nonce, code_challenge: values.challenge, code_challenge_method: "S256", ...extra }).toString();
    return redirect(res, authorize.toString(), [`${TX_COOKIE}=${encodeURIComponent(seal({ ...values, origin, returnTo: returnTo ?? "/playground/", exp: Date.now() + TX_MAX_AGE * 1000 }, cookieKey))}${COOKIE_FLAGS}; Max-Age=${TX_MAX_AGE}`]);
  }
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/api/auth/health") return send(res, 200, { ok: true, issuer: config.issuer });
      if (req.method === "GET" && url.pathname === "/api/auth/login") {
        const origin = originOf(req, config);
        if (!origin) return send(res, 400, { error: "unknown_origin" });
        return await startLogin(res, origin, safeReturnTo(url.searchParams.get("returnTo")), {});
      }
      if (req.method === "POST" && url.pathname === "/api/auth/login") {
        const origin = originOf(req, config);
        if (!origin) return send(res, 400, { error: "unknown_origin" });
        if ((req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase() !== FORM_TYPE) return send(res, 400, { error: "invalid_request" });
        // connection: close so Node drops the socket after replying; an unread oversize body is never drained.
        if (Number(req.headers["content-length"] ?? 0) > LOGIN_BODY_MAX) { res.setHeader("connection", "close"); return send(res, 413, { error: "payload_too_large" }); }
        const body = await readBody(req, LOGIN_BODY_MAX);
        if (body === null) { res.setHeader("connection", "close"); return send(res, 413, { error: "payload_too_large" }); }
        if (body === undefined) { res.setHeader("connection", "close"); return send(res, 400, { error: "invalid_request" }); }
        const form = new URLSearchParams(body);
        const intent = form.get("intent");
        if (intent !== "sign-in" && intent !== "register") return send(res, 400, { error: "invalid_request" });
        const email = validEmail(form.get("email"));
        // Never echo or log the email; the form-user path only needs the mode back.
        if (!email) return redirect(res, `${origin}/login/?mode=${intent}&error=invalid-email`);
        return await startLogin(res, origin, safeReturnTo(form.get("returnTo")), { login_hint: email, identifier: "email", first_screen: `identifier:${intent}`, prompt: "login" });
      }
      if (req.method === "GET" && url.pathname === "/api/auth/callback") {
        const origin = originOf(req, config);
        const transaction = open(requestCookie(req, TX_COOKIE), cookieKey); const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
        if (!origin || !transaction || transaction.origin !== origin || transaction.exp < Date.now() || !code || state !== transaction.state) return send(res, 400, { error: "invalid_callback" });
        const identity = await exchangeCode(config, await discovery(config), code, transaction.verifier, transaction.nonce, `${origin}/api/auth/callback`);
        if (!identity.roles.some((role) => config.requiredRoles.has(role))) return redirect(res, `${origin}/access-pending/`, [`${TX_COOKIE}=; Max-Age=0${COOKIE_FLAGS}`, `${SESSION_COOKIE}=; Max-Age=0${COOKIE_FLAGS}`]);
        const session = seal({ ...identity, exp: Date.now() + SESSION_MAX_AGE * 1000 }, cookieKey);
        return redirect(res, `${origin}${safeReturnTo(transaction.returnTo) ?? "/playground/"}`, [`${TX_COOKIE}=; Max-Age=0${COOKIE_FLAGS}`, `${SESSION_COOKIE}=${encodeURIComponent(session)}${COOKIE_FLAGS}; Max-Age=${SESSION_MAX_AGE}`]);
      }
      if (req.method === "GET" && url.pathname === "/api/auth/session") {
        const session = open(requestCookie(req, SESSION_COOKIE), cookieKey);
        if (!session || typeof session.sub !== "string" || session.exp < Date.now()) return send(res, 401, { authenticated: false });
        return send(res, 200, { authenticated: true, sub: session.sub, email: session.email ?? null, name: session.name ?? null, tier: "auth", admin: (session.roles ?? []).includes("lawyerlab-admin") });
      }
      // Internal bridge for the Tool Parse gateway. Not proxied by nginx (only /api/auth/ is); the bridge network is the trust boundary.
      if (req.method === "GET" && url.pathname === "/internal/auth/identity") {
        if (!bridgeAuthorized(req, config)) return send(res, 403, { authenticated: false });
        const session = open(requestCookie(req, SESSION_COOKIE), cookieKey);
        if (!session || typeof session.sub !== "string" || session.exp < Date.now()) return send(res, 401, { authenticated: false });
        return send(res, 200, { authenticated: true, sub: session.sub });
      }
      if (req.method === "GET" && url.pathname === "/api/auth/logout") {
        const origin = originOf(req, config);
        if (!origin) return send(res, 400, { error: "unknown_origin" });
        const cookies = [`${SESSION_COOKIE}=; Max-Age=0${COOKIE_FLAGS}`, `${TX_COOKIE}=; Max-Age=0${COOKIE_FLAGS}`];
        try {
          const document = await discovery(config);
          if (typeof document.end_session_endpoint !== "string") throw new Error("OIDC discovery missing end_session_endpoint");
          const logout = new URL(document.end_session_endpoint);
          logout.searchParams.set("client_id", config.clientId);
          logout.searchParams.set("post_logout_redirect_uri", `${origin}/`);
          return redirect(res, logout.toString(), cookies);
        } catch {
          return redirect(res, `${origin}/`, cookies);
        }
      }
      return send(res, 404, { error: "not_found" });
    } catch (error) {
      console.error("auth request failed", error instanceof Error ? `${error.message}${error.cause?.code ? ` (${error.cause.code})` : ""}` : "unknown error");
      return send(res, 502, { error: "authentication_unavailable" });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  createAuthServer(config).listen(config.port, config.host, () => console.log(`auth-server listening on ${config.host}:${config.port}`));
}
