import { createHash, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getStore } from "./store";

export const SESSION_COOKIE = "mrust_session";
const SESSION_DAYS = 30;
export const PASSCODE_TTL_MIN = 10;

export function sessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
    return new TextEncoder().encode("dev-only-secret-not-for-production");
  }
  return new TextEncoder().encode(s);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export interface Session {
  email: string;
  admin: boolean;
  /** Demo login: can browse and click, but nothing is saved. */
  demo: boolean;
}

/** The demo account exists only when both DEMO_EMAIL and DEMO_PASSCODE are set. */
export function demoAccount(): { email: string; passcode: string } | null {
  const email = process.env.DEMO_EMAIL?.trim().toLowerCase();
  const passcode = process.env.DEMO_PASSCODE?.trim();
  return email && passcode ? { email, passcode } : null;
}

export function isDemo(email: string): boolean {
  return demoAccount()?.email === normalizeEmail(email);
}

/** Allowed raters and admins live in the users table (managed from /admin). */
export async function lookupUser(email: string): Promise<Session | null> {
  const norm = normalizeEmail(email);
  if (isDemo(norm)) return { email: norm, admin: false, demo: true };
  const u = await getStore().getUser(norm);
  return u ? { email: u.email, admin: u.is_admin, demo: false } : null;
}

export function generatePasscode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashPasscode(email: string, code: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev";
  return createHash("sha256").update(`${normalizeEmail(email)}:${code}:${secret}`).digest("hex");
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionSecret());
}

export async function verifySessionToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    return typeof payload.email === "string" ? { email: payload.email } : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

/** Current logged-in user, or null. Server components / route handlers only. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  // Re-checked on every request so removals and admin changes apply immediately.
  return session ? lookupUser(session.email) : null;
}
