import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "mrust_session";

async function loggedIn(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return false;
  const secret = process.env.SESSION_SECRET ?? "dev-only-secret-not-for-production";
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const ok = await loggedIn(req);
  const { pathname } = req.nextUrl;
  if (pathname === "/login") {
    return ok ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  return ok ? NextResponse.next() : NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/", "/login", "/admin"] };
