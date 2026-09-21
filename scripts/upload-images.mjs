// Uploads every case image in ./Images (or the folder given as an argument) to the
// Supabase Storage bucket. Needs SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const bucketName = process.env.SUPABASE_BUCKET ?? "xrays";
const dir = process.argv[2] ?? "Images";
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: buckets } = await supabase.storage.listBuckets();
if (!buckets?.some((b) => b.name === bucketName)) {
  const { error } = await supabase.storage.createBucket(bucketName, { public: false });
  if (error) throw error;
  console.log(`Created private bucket "${bucketName}"`);
}

const RE = /^(\d+)_(AP|Lat)_(med|lat|ant|post)\.(jpe?g|png)$/i;
const files = readdirSync(dir).filter((f) => RE.test(f));
if (!files.length) {
  console.error(`No case images found in ${dir} (expected names like 1_AP_med.jpg)`);
  process.exit(1);
}
const bucket = supabase.storage.from(bucketName);
for (const f of files) {
  const type = f.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const { error } = await bucket.upload(f, readFileSync(path.join(dir, f)), { contentType: type, upsert: true });
  if (error) throw new Error(`${f}: ${error.message}`);
  console.log(`uploaded ${f}`);
}
console.log(`Done: ${files.length} files in bucket "${bucketName}"`);
