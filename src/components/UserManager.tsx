"use client";

import { useState } from "react";
import type { UserRow } from "@/lib/store";

interface Props {
  initialUsers: UserRow[];
  self: string;
}

export default function UserManager({ initialUsers, self }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE", body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setUsers(data.users);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await call("POST", { email, admin }, "add")) {
      setEmail("");
      setAdmin(false);
    }
  }

  return (
    <section className="users">
      <div className="users-head">
        <h2>Raters</h2>
        <span className="muted">{users.length} allowed to sign in</span>
      </div>

      <ul className="user-list">
        {users.map((u) => {
          const isSelf = u.email === self;
          return (
            <li key={u.email} className="user-row">
              <span className="user-email" title={u.email}>
                {u.email}
                {isSelf && <span className="you">you</span>}
              </span>
              <label className={`toggle ${isSelf ? "disabled" : ""}`} title={isSelf ? "You can't change your own role" : ""}>
                <input
                  type="checkbox"
                  checked={u.is_admin}
                  disabled={isSelf || busy !== null}
                  onChange={(e) => void call("POST", { email: u.email, admin: e.target.checked }, u.email)}
                />
                Admin
              </label>
              <button
                type="button"
                className="link danger"
                disabled={isSelf || busy !== null}
                onClick={() => {
                  if (confirm(`Remove ${u.email}? Their scores are kept.`)) void call("DELETE", { email: u.email }, u.email);
                }}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <form onSubmit={add} className="user-add">
        <input
          type="email"
          required
          placeholder="new.rater@institution.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy !== null}
        />
        <label className="toggle">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} disabled={busy !== null} />
          Admin
        </label>
        <button type="submit" className="btn" disabled={busy !== null || !email}>
          Add
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
