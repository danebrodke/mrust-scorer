import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { storageBucket } from "./storage";

export type View = "AP" | "Lat";
export type Cortex = "medial" | "lateral" | "anterior" | "posterior";

export interface CaseImage {
  file: string;
  view: View;
  /** Cortex shown on the LEFT side of the image (from the filename). */
  left: Cortex;
  /** Cortex shown on the RIGHT side of the image. */
  right: Cortex;
}

export interface Case {
  id: string;
  ap: CaseImage;
  lat: CaseImage;
}

/** Local fallback when Supabase Storage isn't configured. */
const IMAGES_DIR = path.join(process.cwd(), "Images");

const CORTEX_ABBR: Record<string, Cortex> = {
  med: "medial",
  lat: "lateral",
  ant: "anterior",
  post: "posterior",
};
const OPPOSITE: Record<Cortex, Cortex> = {
  medial: "lateral",
  lateral: "medial",
  anterior: "posterior",
  posterior: "anterior",
};

// e.g. "3_AP_med.jpg" -> case 3, AP view, medial cortex on the left side of the image
const FILE_RE = /^(\d+)_(AP|Lat)_(med|lat|ant|post)\.(jpe?g|png)$/i;

export function safeImageName(name: string): boolean {
  return FILE_RE.test(name);
}

async function listImageNames(): Promise<string[]> {
  const bucket = storageBucket();
  if (bucket) {
    const { data, error } = await bucket.list("", { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Storage list failed: ${error.message}`);
    return data.map((o) => o.name);
  }
  return fs.existsSync(IMAGES_DIR) ? fs.readdirSync(IMAGES_DIR) : [];
}

export async function readImage(name: string): Promise<Buffer | null> {
  if (!safeImageName(name)) return null;
  const bucket = storageBucket();
  if (bucket) {
    const { data, error } = await bucket.download(name);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  try {
    return await fsp.readFile(path.join(IMAGES_DIR, name));
  } catch {
    return null;
  }
}

const CACHE_MS = 60_000;
let cached: { at: number; cases: Case[] } | null = null;

export async function listCases(): Promise<Case[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.cases;
  const byId = new Map<string, Partial<Case>>();
  for (const file of await listImageNames()) {
    const m = FILE_RE.exec(file);
    if (!m) continue;
    const [, id, viewRaw, leftRaw] = m;
    const view: View = viewRaw.toUpperCase() === "AP" ? "AP" : "Lat";
    const left = CORTEX_ABBR[leftRaw.toLowerCase()];
    const img: CaseImage = { file, view, left, right: OPPOSITE[left] };
    const entry = byId.get(id) ?? { id };
    if (view === "AP") entry.ap = img;
    else entry.lat = img;
    byId.set(id, entry);
  }
  const cases = [...byId.values()]
    .filter((c): c is Case => Boolean(c.ap && c.lat))
    .sort((a, b) => Number(a.id) - Number(b.id));
  cached = { at: Date.now(), cases };
  return cases;
}
