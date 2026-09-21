import { NextResponse } from "next/server";
import { generatePasscode, hashPasscode, isDemo, isValidEmail, lookupUser, normalizeEmail, PASSCODE_TTL_MIN } from "@/lib/auth";
import { mailConfigured, sendPasscode } from "@/lib/mail";
import { getStore } from "@/lib/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(body.email ?? ""));
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!(await lookupUser(email))) {
    return NextResponse.json({ error: "That email isn't on the allowed list." }, { status: 403 });
  }
  // Demo account: fixed passcode, nothing emailed.
  if (isDemo(email)) return NextResponse.json({ ok: true, demo: true });
  const code = generatePasscode();
  const expiresAt = new Date(Date.now() + PASSCODE_TTL_MIN * 60_000);
  try {
    await getStore().savePasscode(email, hashPasscode(email, code), expiresAt);
    await sendPasscode(email, code);
  } catch (err) {
    console.error("[auth/request]", err);
    return NextResponse.json({ error: "Couldn't send the passcode. Try again in a moment." }, { status: 500 });
  }
  // Local preview without Gmail configured: hand the code straight to the UI.
  const devCode = !mailConfigured() && process.env.NODE_ENV !== "production" ? code : undefined;
  return NextResponse.json({ ok: true, devCode });
}
