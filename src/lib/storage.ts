import { createClient } from "@supabase/supabase-js";

export const BUCKET = process.env.SUPABASE_BUCKET ?? "xrays";

/** Supabase Storage bucket client, or null when not configured (local dev reads ./Images instead). */
export function storageBucket() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET);
}
