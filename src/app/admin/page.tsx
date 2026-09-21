import { redirect } from "next/navigation";
import UserManager from "@/components/UserManager";
import { getSession } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.admin) redirect("/");

  const users = await getStore().listUsers();

  return (
    <main className="centered">
      <div className="card wide">
        <h1>mRUST Scorer</h1>
        <p className="muted">Signed in as {session.email}</p>
        <div className="choices">
          <a className="choice primary" href="/">
            <span className="choice-title">Score cases</span>
            <span className="choice-sub">Continue where you left off</span>
          </a>
          <a className="choice" href="/api/export">
            <span className="choice-title">Download all scores</span>
            <span className="choice-sub">CSV, one row per rater and case</span>
          </a>
        </div>
        <UserManager initialUsers={users} self={session.email} />
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="link">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
