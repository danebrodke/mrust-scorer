import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listCases } from "@/lib/cases";
import { getStore } from "@/lib/store";

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const caseId = String(body.caseId ?? "");
  const cortex = String(body.cortex ?? "");
  const value = Number(body.value);

  const c = (await listCases()).find((x) => x.id === caseId);
  const img = [c?.ap, c?.lat].find((i) => i && (i.left === cortex || i.right === cortex));
  if (!c || !img || !Number.isInteger(value) || value < 1 || value > 4) {
    return NextResponse.json({ error: "Invalid score." }, { status: 400 });
  }
  if (!session.demo) {
    await getStore().setScore({ email: session.email, case_id: caseId, view: img.view, cortex, value });
  }
  return NextResponse.json({ ok: true, saved: !session.demo });
}
