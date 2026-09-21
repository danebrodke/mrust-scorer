import { NextResponse } from "next/server";
import { createSessionToken, demoAccount, hashPasscode, lookupUser, normalizeEmail, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getStore } from "@/lib/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(body.email ?? ""));
  const code = String(body.code ?? "").replace(/\D/g, "");
  const user = code.length === 6 ? await lookupUser(email) : null;
  if (!user) {
    return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  }
  const ok = user.demo
    ? code === demoAccount()?.passcode
    : await getStore().consumePasscode(email, hashPasscode(email, code));
  if (!ok) {
    return NextResponse.json({ error: "Wrong or expired code." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, admin: user.admin });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(email), sessionCookieOptions());
  return res;
}
