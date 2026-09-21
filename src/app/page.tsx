import { redirect } from "next/navigation";
import Scorer from "@/components/Scorer";
import { getSession } from "@/lib/auth";
import { listCases } from "@/lib/cases";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  const cases = await listCases();
  const rows = await getStore().getScores(session.email);
  const scores: Record<string, number> = {};
  for (const r of rows) scores[`${r.case_id}:${r.cortex}`] = r.value;

  return <Scorer cases={cases} initialScores={scores} email={session.email} admin={session.admin} demo={session.demo} />;
}
