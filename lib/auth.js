import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const SESSION_COOKIE = "wager_session";
const STATE_COOKIE = "wager_oauth_state";
const SESSION_DAYS = 120;
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const cookie = (name, value, maxAge) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export function baseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export async function currentUser(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.email !== "string") return null;
    return { email: payload.email, name: payload.name || "" };
  } catch {
    return null;
  }
}

export function isAdmin(email) {
  const list = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export function startLogin(req, res) {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${baseUrl(req)}/api/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account"
  });
  res.setHeader("Set-Cookie", cookie(STATE_COOKIE, state, 600));
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  res.end();
}

export async function finishLogin(req, res) {
  const url = new URL(req.url, baseUrl(req));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = cookies(req)[STATE_COOKIE];
  const fail = (why) => { res.writeHead(302, { Location: `/?login_error=${encodeURIComponent(why)}` }); res.end(); };
  if (!code || !state || !expected || state !== expected) return fail("state");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${baseUrl(req)}/api/auth/callback`,
      grant_type: "authorization_code"
    })
  });
  if (!tokenRes.ok) return fail("token");
  const { id_token } = await tokenRes.json();
  let payload;
  try {
    ({ payload } = await jwtVerify(id_token, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.GOOGLE_CLIENT_ID
    }));
  } catch {
    return fail("verify");
  }
  if (!payload.email || payload.email_verified !== true) return fail("email");

  res.setHeader("Set-Cookie", [await sessionCookie(payload.email.toLowerCase(), payload.name || ""), cookie(STATE_COOKIE, "", 0)]);
  res.writeHead(302, { Location: "/" });
  res.end();
}

export async function sessionCookie(email, name) {
  const session = await new SignJWT({ email, name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  return cookie(SESSION_COOKIE, session, SESSION_DAYS * 86400);
}

// Email + PIN sign-in. Its identities live under "pin:<email>" so a typed-in email can never
// act as the Google account of the same address (or as an admin, unless listed with the prefix).
export const PIN_PREFIX = "pin:";
export const displayEmail = (id) => (id.startsWith(PIN_PREFIX) ? id.slice(PIN_PREFIX.length) : id);
export const googleEnabled = () => !!process.env.GOOGLE_CLIENT_ID;

const scryptAsync = promisify(scrypt);
export async function hashPin(pin) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await scryptAsync(pin, salt, 32)).toString("hex")}`;
}
export async function checkPin(pin, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const got = await scryptAsync(pin, Buffer.from(salt, "hex"), 32);
  return timingSafeEqual(got, Buffer.from(hash, "hex"));
}

export function logout(res) {
  res.setHeader("Set-Cookie", cookie(SESSION_COOKIE, "", 0));
  res.writeHead(302, { Location: "/" });
  res.end();
}

/** Rejects cross-site and non-JSON writes. */
export function sameOriginJson(req) {
  const ct = req.headers["content-type"] || "";
  if (!ct.startsWith("application/json")) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers["x-forwarded-host"] || req.headers.host); } catch { return false; }
}
