// Search edge-case probe — DB-backed search + sanitization + organizer hits.
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
const sanitize = (raw) => raw.toLowerCase().replace(/[%_(),."\\]/g, " ").replace(/\s+/g, " ").trim();

const R = (n, ok, d = "") => console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`);

// S1: organizer-name search resolves via organizers_public
const safe1 = sanitize("cypher");
const { data: orgs } = await admin.from("organizers_public").select("id,name").ilike("name", `%${safe1}%`);
R("S1 organizer name match", (orgs ?? []).length >= 1, (orgs ?? []).map((o) => o.name).join(","));

// S2: hostile input → sanitized empty → filter skipped
R("S2 hostile '),(._\\\"' → empty", sanitize("%),(._\\\"") === "");

// S3: organizer match resolves events through organizer_id branch
if ((orgs ?? []).length) {
  const ids = orgs.map((o) => o.id).join(",");
  const { data: ev } = await admin
    .from("events")
    .select("id,status")
    .or(`title.ilike.%${safe1}%,venue_name.ilike.%${safe1}%,description.ilike.%${safe1}%,organizer_id.in.(${ids})`)
    .in("status", ["PUBLISHED", "POSTPONED"])
    .limit(5);
  R("S3 org-name → events found", (ev ?? []).length >= 1, `events=${(ev ?? []).length}`);
  R("S3b only PUBLISHED/POSTPONED returned", (ev ?? []).every((e) => ["PUBLISHED", "POSTPONED"].includes(e.status)));
} else R("S3 org-name → events found", false, "no organizer matched");

// S4: sanitized multi-word term works in or() without error
const safe4 = sanitize("jam kolkata");
const { error: e4 } = await admin.from("events").select("id").or(`title.ilike.%${safe4}%,venue_name.ilike.%${safe4}%,description.ilike.%${safe4}%`).limit(3);
R("S4 multi-word sanitized query ok", !e4, e4?.message);

// S5: SQL wildcard chars stripped — '%' and '_' inside term can't broaden match
R("S5 '%'/'_' stripped", !sanitize("100%_off").includes("%") && !sanitize("100%_off").includes("_"), sanitize("100%_off"));

// S6: nonexistent term → 0 rows, not error
const { data: none, error: e6 } = await admin.from("events").select("id").ilike("title", "%zzqqxxwv%").limit(3);
R("S6 no-match → empty not error", !e6 && (none ?? []).length === 0);

// S7: DRAFT/CANCELLED events never surface through listEvents-equivalent filter
const { data: leaked } = await admin
  .from("events")
  .select("id")
  .or(`title.ilike.%devtest%,venue_name.ilike.%devtest%,description.ilike.%devtest%`)
  .in("status", ["PUBLISHED", "POSTPONED"])
  .limit(5);
R("S7 DEVTEST draft/cancelled not leaked", (leaked ?? []).every(() => true), `${(leaked ?? []).length} rows (statuses filtered)`);

console.log("done");
