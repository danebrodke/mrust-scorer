import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

export interface ScoreRow {
  email: string;
  case_id: string;
  view: string;
  cortex: string;
  value: number;
  updated_at: string;
}

export interface UserRow {
  email: string;
  is_admin: boolean;
  created_at: string;
}

export interface Store {
  listUsers(): Promise<UserRow[]>;
  getUser(email: string): Promise<UserRow | null>;
  upsertUser(email: string, isAdmin: boolean): Promise<void>;
  removeUser(email: string): Promise<void>;
  getScores(email: string): Promise<ScoreRow[]>;
  setScore(row: Omit<ScoreRow, "updated_at">): Promise<void>;
  allScores(): Promise<ScoreRow[]>;
  savePasscode(email: string, codeHash: string, expiresAt: Date): Promise<void>;
  /** Returns true and deletes the passcode if it matches; false otherwise. */
  consumePasscode(email: string, codeHash: string): Promise<boolean>;
}

const MAX_ATTEMPTS = 5;

/** Bootstrap list used only when the users table is empty (first deploy). */
function seedUsers(): { email: string; is_admin: boolean }[] {
  const split = (v: string | undefined) =>
    (v ?? "").split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const admins = new Set(split(process.env.ADMIN_EMAILS));
  const all = new Set([...split(process.env.ALLOWED_EMAILS), ...admins]);
  return [...all].map((email) => ({ email, is_admin: admins.has(email) }));
}

/* ---------------- Postgres (Supabase) ---------------- */

const SCHEMA = `
create table if not exists users (
  email text primary key,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists scores (
  email text not null,
  case_id text not null,
  view text not null,
  cortex text not null,
  value smallint not null check (value between 1 and 4),
  updated_at timestamptz not null default now(),
  primary key (email, case_id, cortex)
);
create table if not exists passcodes (
  id bigserial primary key,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists passcodes_email_idx on passcodes (email);
-- The app connects as the table owner, which bypasses RLS. Enabling it with no
-- policies blocks Supabase's anon/authenticated roles via the Data API.
alter table users enable row level security;
alter table scores enable row level security;
alter table passcodes enable row level security;
`;

function pgStore(url: string): Store {
  const sql = postgres(url, { prepare: false, ssl: "require", max: 1, idle_timeout: 20 });
  let ready: Promise<void> | null = null;
  const ensure = () =>
    (ready ??= (async () => {
      await sql.unsafe(SCHEMA);
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
      if (n === 0) {
        for (const u of seedUsers()) {
          await sql`insert into users (email, is_admin) values (${u.email}, ${u.is_admin}) on conflict do nothing`;
        }
      }
    })());

  return {
    async listUsers() {
      await ensure();
      return sql<UserRow[]>`select email, is_admin, created_at::text from users order by is_admin desc, email`;
    },
    async getUser(email) {
      await ensure();
      const rows = await sql<UserRow[]>`select email, is_admin, created_at::text from users where email = ${email}`;
      return rows[0] ?? null;
    },
    async upsertUser(email, isAdmin) {
      await ensure();
      await sql`insert into users (email, is_admin) values (${email}, ${isAdmin})
        on conflict (email) do update set is_admin = excluded.is_admin`;
    },
    async removeUser(email) {
      await ensure();
      await sql`delete from users where email = ${email}`;
    },
    async getScores(email) {
      await ensure();
      return sql<ScoreRow[]>`select email, case_id, view, cortex, value, updated_at::text from scores where email = ${email}`;
    },
    async setScore({ email, case_id, view, cortex, value }) {
      await ensure();
      await sql`insert into scores (email, case_id, view, cortex, value)
        values (${email}, ${case_id}, ${view}, ${cortex}, ${value})
        on conflict (email, case_id, cortex) do update set value = excluded.value, view = excluded.view, updated_at = now()`;
    },
    async allScores() {
      await ensure();
      return sql<ScoreRow[]>`select email, case_id, view, cortex, value, updated_at::text from scores order by email, case_id, view, cortex`;
    },
    async savePasscode(email, codeHash, expiresAt) {
      await ensure();
      await sql`delete from passcodes where email = ${email} or expires_at < now()`;
      await sql`insert into passcodes (email, code_hash, expires_at) values (${email}, ${codeHash}, ${expiresAt})`;
    },
    async consumePasscode(email, codeHash) {
      await ensure();
      const rows = await sql<{ id: number; code_hash: string; attempts: number }[]>`
        select id, code_hash, attempts from passcodes
        where email = ${email} and expires_at > now() order by id desc limit 1`;
      const row = rows[0];
      if (!row || row.attempts >= MAX_ATTEMPTS) return false;
      if (row.code_hash === codeHash) {
        await sql`delete from passcodes where email = ${email}`;
        return true;
      }
      await sql`update passcodes set attempts = attempts + 1 where id = ${row.id}`;
      return false;
    },
  };
}

/* ---------------- Local JSON file (dev without DATABASE_URL) ---------------- */

interface FileData {
  users: UserRow[];
  scores: ScoreRow[];
  passcodes: { email: string; code_hash: string; expires_at: string; attempts: number }[];
}

function fileStore(): Store {
  const file = path.join(process.cwd(), ".data", "store.json");
  const read = (): FileData => {
    let d: FileData;
    try {
      d = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      d = { users: [], scores: [], passcodes: [] };
    }
    if (!d.users?.length) {
      d.users = seedUsers().map((u) => ({ ...u, created_at: new Date().toISOString() }));
    }
    return d;
  };
  const write = (d: FileData) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(d, null, 2));
  };

  return {
    async listUsers() {
      return [...read().users].sort((a, b) => Number(b.is_admin) - Number(a.is_admin) || a.email.localeCompare(b.email));
    },
    async getUser(email) {
      return read().users.find((u) => u.email === email) ?? null;
    },
    async upsertUser(email, isAdmin) {
      const d = read();
      const u = d.users.find((x) => x.email === email);
      if (u) u.is_admin = isAdmin;
      else d.users.push({ email, is_admin: isAdmin, created_at: new Date().toISOString() });
      write(d);
    },
    async removeUser(email) {
      const d = read();
      d.users = d.users.filter((x) => x.email !== email);
      write(d);
    },
    async getScores(email) {
      return read().scores.filter((s) => s.email === email);
    },
    async setScore(row) {
      const d = read();
      const i = d.scores.findIndex(
        (s) => s.email === row.email && s.case_id === row.case_id && s.cortex === row.cortex,
      );
      const next = { ...row, updated_at: new Date().toISOString() };
      if (i >= 0) d.scores[i] = next;
      else d.scores.push(next);
      write(d);
    },
    async allScores() {
      return read().scores;
    },
    async savePasscode(email, codeHash, expiresAt) {
      const d = read();
      d.passcodes = d.passcodes.filter((p) => p.email !== email && new Date(p.expires_at) > new Date());
      d.passcodes.push({ email, code_hash: codeHash, expires_at: expiresAt.toISOString(), attempts: 0 });
      write(d);
    },
    async consumePasscode(email, codeHash) {
      const d = read();
      const p = d.passcodes.find((x) => x.email === email && new Date(x.expires_at) > new Date());
      if (!p || p.attempts >= MAX_ATTEMPTS) return false;
      if (p.code_hash === codeHash) {
        d.passcodes = d.passcodes.filter((x) => x.email !== email);
        write(d);
        return true;
      }
      p.attempts += 1;
      write(d);
      return false;
    },
  };
}

/* ---------------- Singleton ---------------- */

declare global {
  // eslint-disable-next-line no-var
  var __mrustStore: Store | undefined;
}

export function getStore(): Store {
  if (!globalThis.__mrustStore) {
    const url = process.env.DATABASE_URL;
    globalThis.__mrustStore = url ? pgStore(url) : fileStore();
    if (!url) console.warn("[mRUST] DATABASE_URL not set: using local file store at .data/store.json");
  }
  return globalThis.__mrustStore;
}
