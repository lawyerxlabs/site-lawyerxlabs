// Fail-closed config loader. Every required value comes from the environment;
// a missing or empty value throws at startup so the service never runs half-configured.

export const REQUIRED_ENV = Object.freeze([
  "AUTH_ISSUER",
  "AUTH_CLIENT_ID",
  "AUTH_CLIENT_SECRET",
  "AUTH_ORIGINS",
  "AUTH_SESSION_SECRET",
  "AUTH_BRIDGE_SECRET",
]);

// Logto roles that may hold a session. Registration = holding one of these roles.
const DEFAULT_ROLES = "lawyerlab-member,lawyerlab-admin";

function parseOrigins(value) {
  const origins = value.split(",").map((o) => o.trim()).filter(Boolean).map((o) => {
    let url;
    try { url = new URL(o); } catch { throw new Error(`auth-server config invalid: AUTH_ORIGINS entry ${o}`); }
    if (url.protocol !== "https:" || url.origin !== o) throw new Error(`auth-server config invalid: AUTH_ORIGINS entry ${o} must be a bare https origin`);
    return url.origin;
  });
  if (origins.length === 0) throw new Error("auth-server config missing: AUTH_ORIGINS");
  return new Set(origins);
}

export function loadConfig(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`auth-server config missing: ${missing.join(", ")}`);
  }
  const port = Number(env.AUTH_PORT ?? 7300);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`auth-server config invalid: AUTH_PORT=${env.AUTH_PORT}`);
  }
  const roles = (env.AUTH_REQUIRED_ROLES?.trim() || DEFAULT_ROLES).split(",").map((r) => r.trim()).filter(Boolean);
  return Object.freeze({
    issuer: env.AUTH_ISSUER.trim(),
    clientId: env.AUTH_CLIENT_ID.trim(),
    clientSecret: env.AUTH_CLIENT_SECRET.trim(),
    origins: parseOrigins(env.AUTH_ORIGINS),
    sessionSecret: env.AUTH_SESSION_SECRET,
    bridgeSecret: env.AUTH_BRIDGE_SECRET,
    requiredRoles: new Set(roles),
    host: env.AUTH_HOST?.trim() || "127.0.0.1",
    port,
  });
}
