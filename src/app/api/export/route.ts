import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listCases } from "@/lib/cases";
import { getStore } from "@/lib/store";

const COLS = ["ap_medial", "ap_lateral", "lat_anterior", "lat_posterior"] as const;

export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Not signed in", { status: 401 });
  if (!session.admin) return new NextResponse("Forbidden", { status: 403 });

  const rows = await getStore().allScores();
  const cases = (await listCases()).map((c) => c.id);
  const byKey = new Map<string, Record<string, string | number>>();
  for (const r of rows) {
    const key = `${r.email}::${r.case_id}`;
    const rec = byKey.get(key) ?? { rater: r.email, case: r.case_id, last_updated: "" };
    rec[`${r.view.toLowerCase()}_${r.cortex}`] = r.value;
    if (r.updated_at > String(rec.last_updated)) rec.last_updated = r.updated_at;
    byKey.set(key, rec);
  }
  const recs = [...byKey.values()].sort(
    (a, b) => String(a.rater).localeCompare(String(b.rater)) || cases.indexOf(String(a.case)) - cases.indexOf(String(b.case)),
  );
  const header = ["rater", "case", ...COLS, "total", "last_updated"];
  const lines = [header.join(",")];
  for (const r of recs) {
    const vals = COLS.map((c) => r[c]);
    const total = vals.every((v) => typeof v === "number") ? vals.reduce((s, v) => s + Number(v), 0) : "";
    lines.push([r.rater, r.case, ...vals.map((v) => v ?? ""), total, r.last_updated].map(csv).join(","));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mrust-scores-${stamp}.csv"`,
    },
  });
}

function csv(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
