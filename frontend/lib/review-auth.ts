import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "feedbackops_review";
const SESSION_HOURS = 8;
const USERNAME_MAX = 64;

export type ReviewSession = {
  username: string;
  exp: number;
};

function sessionSecret(): string {
  return process.env.REVIEW_SESSION_SECRET || "";
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function reviewUsers(): Map<string, string> {
  const raw = process.env.REVIEW_USERS || "";
  if (!raw.trim()) return new Map();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    const users = new Map<string, string>();
    for (const [username, hash] of Object.entries(parsed)) {
      if (typeof username === "string" && typeof hash === "string" && hash.startsWith("scrypt$")) {
        users.set(username, hash);
      }
    }
    return users;
  } catch {
    return new Map();
  }
}

function verifyScrypt(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length > 0 && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function perUserMode(): boolean {
  return Boolean((process.env.REVIEW_USERS || "").trim());
}

export function reviewAuthConfigured(): boolean {
  if (!sessionSecret()) return false;
  return perUserMode() ? reviewUsers().size > 0 : Boolean(process.env.REVIEW_PASSWORD);
}

export function verifyReviewerCredentials(username: string, password: string): string | null {
  if (perUserMode()) {
    const users = reviewUsers();
    if (users.size === 0) return null;
    const user = username.trim();
    if (!user || user.length > USERNAME_MAX) return null;
    const stored = users.get(user);
    return stored && verifyScrypt(password, stored) ? user : null;
  }

  const expected = process.env.REVIEW_PASSWORD || "";
  if (!expected || !safeEqual(expected, password)) return null;
  return username.trim() || "reviewer";
}

export function createSessionToken(username: string): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("review_auth_not_configured");
  const payload = Buffer.from(
    JSON.stringify({
      role: "reviewer",
      sub: username,
      exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
    })
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined): ReviewSession | null {
  if (!token || !sessionSecret()) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  if (!safeEqual(expected, signature)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      data.role !== "reviewer" ||
      typeof data.sub !== "string" ||
      !data.sub ||
      data.sub.length > USERNAME_MAX ||
      typeof data.exp !== "number" ||
      data.exp <= Date.now()
    ) {
      return null;
    }
    return { username: data.sub, exp: data.exp };
  } catch {
    return null;
  }
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function getReviewSession(cookieHeader: string | null): ReviewSession | null {
  return verifySessionToken(readCookie(cookieHeader, COOKIE_NAME));
}

export function isReviewer(cookieHeader: string | null): boolean {
  return getReviewSession(cookieHeader) !== null;
}

function secureSuffix(secure: boolean): string {
  return secure ? "; Secure" : "";
}

export function isSecureRequest(request: Request): boolean {
  return (
    request.headers.get("x-forwarded-proto") === "https" ||
    new URL(request.url).protocol === "https:"
  );
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${
    SESSION_HOURS * 60 * 60
  }${secureSuffix(secure)}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureSuffix(secure)}`;
}
