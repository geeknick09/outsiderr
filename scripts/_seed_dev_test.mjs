// Seed deterministic dev-test users + events for E2E scenario testing.
// Usage: node scripts/_seed_dev_test.mjs
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
// Idempotent — safe to re-run (finds by email/title, else inserts).
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Node 21 lacks native WebSocket — realtime isn't used in scripts, stub it.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class { constructor() {} close() {} };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const envVar = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const URL = envVar("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE = envVar("SUPABASE_SERVICE_ROLE_KEY");
if (!URL || !SERVICE) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const pinHash = (eventId, pin) => createHash("sha256").update(`${eventId}:${pin}`).digest("hex");
const inDays = (d) => new Date(Date.now() + d * 864e5).toISOString();

export const DEV_PASSWORD = "DevTest#1234";
const USERS = [
  { email: "dev.user@outsiderr.test", name: "Dev User", admin: false, organizer: false },
  { email: "dev.user2@outsiderr.test", name: "Dev User Two", admin: false, organizer: false },
  { email: "dev.organizer@outsiderr.test", name: "Dev Organizer", admin: false, organizer: true },
  { email: "dev.admin@outsiderr.test", name: "Dev Admin", admin: true, organizer: false },
];

async function ensureUser({ email, name, admin: isAdmin, organizer: isOrg }) {
  // find or create the auth user
  let uid;
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users?.find((u) => u.email === email);
  if (existing) {
    uid = existing.id;
    await admin.auth.admin.updateUserById(uid, { password: DEV_PASSWORD, email_confirm: true });
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email, password: DEV_PASSWORD, email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    uid = data.user.id;
  }
  // ensure profile row + flags (handle_new_user trigger creates it; upsert anyway)
  await admin.from("profiles").upsert({ id: uid, full_name: name, is_admin: isAdmin, is_organizer: isOrg }, { onConflict: "id" });
  console.log(`  user ${email} → ${uid} (admin=${isAdmin} org=${isOrg})`);
  return uid;
}

async function ensureOrganizer(ownerId) {
  const { data: existing } = await admin.from("organizers").select("id").eq("owner_id", ownerId).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin.from("organizers").insert({
    owner_id: ownerId, name: "Dev Test Org", bio: "Seeded test organizer", upi_id: "devtest@upi",
    kyc_submitted: true, kyc_status: "APPROVED",
  }).select("id").single();
  if (error) throw new Error(`organizer: ${error.message}`);
  console.log(`  organizer → ${data.id}`);
  return data.id;
}

async function ensureEvent(orgId, title, opts) {
  const { data: existing } = await admin.from("events").select("id").eq("title", title).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin.from("events").insert({
    organizer_id: orgId, title, description: opts.description ?? "Seeded E2E test event",
    category: "JAM_GIG", categories: ["JAM_GIG"], city: "KOLKATA",
    venue_name: "Dev Test Venue", venue_address: "123 Test St",
    google_maps_link: "https://maps.google.com/?q=kolkata",
    starts_at: inDays(opts.daysAhead ?? 7), ends_at: inDays((opts.daysAhead ?? 7) + 0.25),
    pricing_mode: opts.pricingMode, status: opts.status ?? "PUBLISHED",
    waitlist_enabled: true, terms: ["Test terms"],
  }).select("id").single();
  if (error) throw new Error(`event ${title}: ${error.message}`);
  console.log(`  event "${title}" → ${data.id}`);
  return data.id;
}

async function ensureTier(eventId, name, pricePaise, qty) {
  const { data: existing } = await admin.from("ticket_tiers").select("id").eq("event_id", eventId).eq("name", name).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin.from("ticket_tiers").insert({
    event_id: eventId, name, price_paise: pricePaise, quantity: qty, perks: [],
  }).select("id").single();
  if (error) throw new Error(`tier ${name}: ${error.message}`);
  return data.id;
}

async function ensurePin(table, eventId, orgId, pin, name, role) {
  await admin.from(table).delete().eq("event_id", eventId).eq("pin_code", pin);
  const row = { event_id: eventId, organizer_id: orgId, pin_code: pin, pin_hash: pinHash(eventId, pin), staff_name: name };
  if (role) row.role = role;
  const { error } = await admin.from(table).insert(row);
  if (error) throw new Error(`${table} pin: ${error.message}`);
  console.log(`  ${table} pin ${pin} on event ${eventId}`);
}

async function main() {
  console.log("Seeding dev-test fixtures…");
  const ids = {};
  for (const u of USERS) ids[u.email] = await ensureUser(u);

  const orgId = await ensureOrganizer(ids["dev.organizer@outsiderr.test"]);

  // Events: paid (booking/orders), free (instant RSVP), tiny (capacity+waitlist), draft (publish flow)
  const paidEvent = await ensureEvent(orgId, "DEVTEST Paid Jam", { pricingMode: "PAID" });
  const freeEvent = await ensureEvent(orgId, "DEVTEST Free Session", { pricingMode: "FREE" });
  const tinyEvent = await ensureEvent(orgId, "DEVTEST Tiny Event", { pricingMode: "PAID" });
  const draftEvent = await ensureEvent(orgId, "DEVTEST Draft Event", { pricingMode: "PAID", status: "DRAFT" });

  const paidTier = await ensureTier(paidEvent, "GA", 50000, 100);   // ₹500 × 100
  const freeTier = await ensureTier(freeEvent, "Entry", 0, 50);     // free × 50
  const tinyTier = await ensureTier(tinyEvent, "GA", 10000, 2);     // ₹100 × 2 (capacity test)

  await ensurePin("scanner_pins", paidEvent, orgId, "123456", "Dev Scanner");
  await ensurePin("box_office_pins", paidEvent, orgId, "654321", "Dev BoxOffice", "ORGANIZER");

  console.log("\n✅ Seed complete.");
  console.log(JSON.stringify({
    users: ids, orgId, paidEvent, freeEvent, tinyEvent, draftEvent,
    paidTier, freeTier, tinyTier,
    scannerPin: "123456", boxOfficePin: "654321", password: DEV_PASSWORD,
  }, null, 2));
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
