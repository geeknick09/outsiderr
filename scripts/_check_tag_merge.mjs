// Backfill: merge event tags + cat:<CATEGORY> into buyers' interested_tags
// for every existing order (mirrors the fixed postBookingSideEffects logic).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
if (typeof globalThis.WebSocket === "undefined") globalThis.WebSocket = class { constructor() {} close() {} };
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const envVar = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const admin = createClient(envVar("NEXT_PUBLIC_SUPABASE_URL"), envVar("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: orders } = await admin.from("orders").select("user_id, event_id, status");
const eventCache = new Map();
const profileCache = new Map();
let merged = 0, skipped = 0;

for (const o of orders ?? []) {
  if (!o.user_id) { skipped++; continue; }
  if (!eventCache.has(o.event_id)) {
    const { data: ev } = await admin.from("events").select("tags, categories").eq("id", o.event_id).maybeSingle();
    eventCache.set(o.event_id, ev);
  }
  const ev = eventCache.get(o.event_id);
  const tags = [...(ev?.tags ?? []), ...(ev?.categories ?? []).map((c) => `cat:${c}`)];
  if (!tags.length) { skipped++; continue; }

  if (!profileCache.has(o.user_id)) {
    const { data: p } = await admin.from("profiles").select("interested_tags").eq("id", o.user_id).maybeSingle();
    profileCache.set(o.user_id, new Set(p?.interested_tags ?? []));
  }
  const existing = profileCache.get(o.user_id);
  const before = existing.size;
  for (const t of tags) existing.add(t);
  if (existing.size === before) { skipped++; continue; }

  const { error } = await admin
    .from("profiles")
    .upsert({ id: o.user_id, interested_tags: [...existing] });
  if (error) console.log(`FAIL user=${o.user_id.slice(0, 8)}: ${error.message}`);
  else { merged++; console.log(`MERGED user=${o.user_id.slice(0, 8)} order-status=${o.status} +${existing.size - before} tags -> ${[...existing].join(", ")}`); }
}

console.log(`\ndone: ${merged} profiles merged, ${skipped} orders skipped (no tags or already merged)`);
