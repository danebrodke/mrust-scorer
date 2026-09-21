import { NextResponse } from "next/server";
import { getSession, isValidEmail, normalizeEmail } from "@/lib/auth";
import { getStore } from "@/lib/store";

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!session.admin) return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  return { session };
}

const list = async () => NextResponse.json({ users: await getStore().listUsers() });

export async function GET() {
  const { error } = await requireAdmin();
  return error ?? list();
}

/** Add a rater, or change whether an existing one is an admin. */
export async function POST(req: Request) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(body.email ?? ""));
  const admin = Boolean(body.admin);
  if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (email === session!.email && !admin) {
    return NextResponse.json({ error: "You can't remove your own admin access." }, { status: 400 });
  }
  await getStore().upsertUser(email, admin);
  return list();
}

export async function DELETE(req: Request) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(body.email ?? ""));
  if (email === session!.email) {
    return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
  }
  await getStore().removeUser(email);
  return list();
}
