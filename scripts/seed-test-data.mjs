// Seed a test database with deterministic test fixtures.
//
// Usage:
//   node scripts/seed-test-data.mjs
//
// Prerequisites:
// - SUPABASE_DB_PASSWORD must be set in .env
// - Run against a TEST database, NOT production
// - Run scripts/wipe-all.mjs first for a clean slate
//
// This script creates:
// - 3 users (admin, organizer, regular)
// - 1 organizer (verified)
// - 3 events (free, paid, sold-out)
// - 4 ticket tiers
// - 2 orders (online + box-office)
// - 2 tickets (1 VALID, 1 USED)
// - 1 scanner PIN + 1 box-office PIN
//
// All IDs are deterministic (defined in tests/fixtures.ts) so tests
// can reference them without querying the database first.
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");

const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();
const dbUrl = envContent.match(/^SUPABASE_DB_URL=(.+)$/m)?.[1]?.trim();

const connectionString = dbUrl || `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

// Deterministic IDs (must match tests/fixtures.ts)
const IDS = {
  ADMIN_USER_ID: "a0000000-0000-4000-8000-000000000001",
  ORGANIZER_OWNER_ID: "a0000000-0000-4000-8000-000000000002",
  REGULAR_USER_ID: "a0000000-0000-4000-8000-000000000003",
  ORGANIZER_ID: "b0000000-0000-4000-8000-000000000001",
  FREE_EVENT_ID: "c0000000-0000-4000-8000-000000000001",
  PAID_EVENT_ID: "c0000000-0000-4000-8000-000000000002",
  SOLD_OUT_EVENT_ID: "c0000000-0000-4000-8000-000000000003",
  FREE_TIER_ID: "d0000000-0000-4000-8000-000000000001",
  PAID_GENERAL_TIER_ID: "d0000000-0000-4000-8000-000000000002",
  PAID_VIP_TIER_ID: "d0000000-0000-4000-8000-000000000003",
  SOLD_OUT_TIER_ID: "d0000000-0000-4000-8000-000000000004",
  ONLINE_ORDER_ID: "e0000000-0000-4000-8000-000000000001",
  BOX_OFFICE_ORDER_ID: "e0000000-0000-4000-8000-000000000002",
  VALID_TICKET_ID: "f0000000-0000-4000-8000-000000000001",
  USED_TICKET_ID: "f0000000-0000-4000-8000-000000000002",
  SCANNER_PIN_ID: "10000000-0000-4000-8000-000000000001",
  BOX_OFFICE_PIN_ID: "10000000-0000-4000-8000-000000000002",
};

function hashPin(eventId, pinCode) {
  return createHash("sha256").update(`${eventId}:${pinCode}`).digest("hex");
}

function futureDate(days, hour = 19) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function main() {
  await client.connect();
  console.log("Connected. Seeding test data...\n");

  // ============================================================
  // 1. Create auth.users (if they don't exist)
  // ============================================================
  console.log("Creating users...");
  for (const [label, id, email] of [
    ["admin", IDS.ADMIN_USER_ID, "admin@outsiderr.test"],
    ["organizer", IDS.ORGANIZER_OWNER_ID, "organizer@outsiderr.test"],
    ["user", IDS.REGULAR_USER_ID, "user@outsiderr.test"],
  ]) {
    await client.query(`
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
      VALUES ($1, $2, 'test_hash', NOW(), NOW(), NOW(), 'authenticated', 'authenticated')
      ON CONFLICT (id) DO NOTHING
    `, [id, email]);
    console.log(`  ✓ ${label}: ${email}`);
  }

  // ============================================================
  // 2. Create profiles
  // ============================================================
  console.log("Creating profiles...");
  await client.query(`
    INSERT INTO public.profiles (id, full_name, phone, is_admin, is_organizer, interested_tags)
    VALUES
      ($1, 'Test Admin', '9000000001', true, false, ARRAY[]::text[]),
      ($2, 'Test Organizer', '9000000002', false, true, ARRAY['hip-hop']),
      ($3, 'Test User', '9000000003', false, false, ARRAY['hip-hop', 'dance'])
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      is_admin = EXCLUDED.is_admin,
      is_organizer = EXCLUDED.is_organizer
  `, [IDS.ADMIN_USER_ID, IDS.ORGANIZER_OWNER_ID, IDS.REGULAR_USER_ID]);
  console.log("  ✓ 3 profiles created");

  // ============================================================
  // 3. Create organizer
  // ============================================================
  console.log("Creating organizer...");
  await client.query(`
    INSERT INTO public.organizers (id, owner_id, name, bio, description, verified, upi_id)
    VALUES ($1, $2, 'Outsiderr Test Crew', 'Test organizer for automated testing', 'A test crew for hip-hop events in Mumbai.', true, 'testorg@upi')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      bio = EXCLUDED.bio,
      verified = EXCLUDED.verified,
      upi_id = EXCLUDED.upi_id
  `, [IDS.ORGANIZER_ID, IDS.ORGANIZER_OWNER_ID]);
  console.log("  ✓ Organizer created");

  // ============================================================
  // 4. Create events
  // ============================================================
  console.log("Creating events...");
  const events = [
    [IDS.FREE_EVENT_ID, "Free Cypher Session - Mumbai", "Open cypher for all hip-hop heads. Free entry.", "CYPHER_BATTLE", "MUMBAI", "Marine Drive", "Marine Drive, Mumbai", futureDate(30), futureDate(30, 23), "FREE", "ORGANIZER", false, 0],
    [IDS.PAID_EVENT_ID, "Underground Dance Battle - Delhi", "1v1 dance battle. Rs 500 entry. Prize pool Rs 10,000.", "CYPHER_BATTLE", "DELHI", "Connaught Place", "Connaught Place, Delhi", futureDate(45), futureDate(45, 23), "PAID", "BUYER", true, 0],
    [IDS.SOLD_OUT_EVENT_ID, "Sold Out Gig - Kolkata", "A sold-out event for waitlist testing.", "JAM_GIG", "KOLKATA", "Test Venue", "Test Address, Kolkata", futureDate(20), futureDate(20, 22), "PAID", "BUYER", false, 5],
  ];
  for (const e of events) {
    await client.query(`
      INSERT INTO public.events (id, organizer_id, title, description, category, city, venue_name, venue_address, starts_at, ends_at, pricing_mode, fee_payer, status, terms, things_to_know, tags, registrations_count, is_featured, commission_bps, commission_enabled, convenience_fee_bps, convenience_fee_enabled, waitlist_enabled, allow_booking_during_event)
      VALUES ($1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PUBLISHED', ARRAY['No refunds'], ARRAY['Bring water'], ARRAY['hip-hop'], $14, $15, 1000, true, 200, true, true, false)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        starts_at = EXCLUDED.starts_at,
        ends_at = EXCLUDED.ends_at
    `, [e[0], null, IDS.ORGANIZER_ID, e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10], e[11], e[12], e[13]]);
    console.log(`  ✓ ${e[1]}`);
  }

  // ============================================================
  // 5. Create ticket tiers
  // ============================================================
  console.log("Creating ticket tiers...");
  const tiers = [
    [IDS.FREE_TIER_ID, IDS.FREE_EVENT_ID, "Entry", 0, 100, 0, "FLAT"],
    [IDS.PAID_GENERAL_TIER_ID, IDS.PAID_EVENT_ID, "General", 50000, 50, 2, "NAMED"],
    [IDS.PAID_VIP_TIER_ID, IDS.PAID_EVENT_ID, "VIP", 200000, 10, 0, "NAMED"],
    [IDS.SOLD_OUT_TIER_ID, IDS.SOLD_OUT_EVENT_ID, "Entry", 50000, 5, 5, "FLAT"],
  ];
  for (const t of tiers) {
    await client.query(`
      INSERT INTO public.ticket_tiers (id, event_id, name, price_paise, quantity, quantity_sold, tier_type, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        price_paise = EXCLUDED.price_paise,
        quantity = EXCLUDED.quantity,
        quantity_sold = EXCLUDED.quantity_sold
    `, t);
    console.log(`  ✓ ${t[2]} (${t[4] - t[5]} available)`);
  }

  // ============================================================
  // 6. Create orders
  // ============================================================
  console.log("Creating orders...");
  // Online order (CONFIRMED, with Razorpay)
  await client.query(`
    INSERT INTO public.orders (id, event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise, platform_fee_paise, commission_paise, convenience_fee_paise, organizer_payout_paise, total_paise, fee_payer, status, razorpay_order_id, razorpay_payment_id, payment_method, invoice_number, confirmed_at, buyer_name, buyer_phone, buyer_email, created_at, is_box_office)
    VALUES ($1, $2, $3, $4, 1, 50000, 50000, 6000, 5000, 1000, 45000, 51000, 'BUYER', 'CONFIRMED', 'rzp_test_order_001', 'rzp_test_payment_001', 'upi', 'INV-001', $5, 'Test User', '9000000003', 'user@outsiderr.test', $5, false)
    ON CONFLICT (id) DO NOTHING
  `, [IDS.ONLINE_ORDER_ID, IDS.PAID_EVENT_ID, IDS.PAID_GENERAL_TIER_ID, IDS.REGULAR_USER_ID, futureDate(10)]);
  console.log("  ✓ Online order (CONFIRMED, ₹510)");

  // Box-office order (CONFIRMED, walk-in)
  await client.query(`
    INSERT INTO public.orders (id, event_id, tier_id, user_id, quantity, unit_price_paise, subtotal_paise, platform_fee_paise, commission_paise, convenience_fee_paise, organizer_payout_paise, total_paise, fee_payer, status, payment_method, invoice_number, confirmed_at, buyer_name, buyer_phone, buyer_email, created_at, is_box_office, order_source)
    VALUES ($1, $2, $3, NULL, 1, 50000, 50000, 5000, 5000, 0, 45000, 50000, 'BUYER', 'CONFIRMED', 'cash', 'INV-002', $4, 'Walk-in Attendee', '9000000004', NULL, $4, true, 'WALKIN_PREEVENT')
    ON CONFLICT (id) DO NOTHING
  `, [IDS.BOX_OFFICE_ORDER_ID, IDS.PAID_EVENT_ID, IDS.PAID_GENERAL_TIER_ID, futureDate(5)]);
  console.log("  ✓ Box-office order (CONFIRMED, ₹500)");

  // ============================================================
  // 7. Create tickets
  // ============================================================
  console.log("Creating tickets...");
  await client.query(`
    INSERT INTO public.tickets (id, order_id, event_id, qr_hash, status, checked_in_at)
    VALUES ($1, $2, $3, 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', 'VALID', NULL)
    ON CONFLICT (id) DO NOTHING
  `, [IDS.VALID_TICKET_ID, IDS.ONLINE_ORDER_ID, IDS.PAID_EVENT_ID]);
  console.log("  ✓ VALID ticket (online order)");

  await client.query(`
    INSERT INTO public.tickets (id, order_id, event_id, qr_hash, status, checked_in_at)
    VALUES ($1, $2, $3, 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b200', 'USED', $4)
    ON CONFLICT (id) DO NOTHING
  `, [IDS.USED_TICKET_ID, IDS.BOX_OFFICE_ORDER_ID, IDS.PAID_EVENT_ID, futureDate(5)]);
  console.log("  ✓ USED ticket (box-office order, already checked in)");

  // ============================================================
  // 8. Create PINs (hashed)
  // ============================================================
  console.log("Creating PINs...");
  const scannerPinHash = hashPin(IDS.PAID_EVENT_ID, "123456");
  const boxOfficePinHash = hashPin(IDS.PAID_EVENT_ID, "654321");

  await client.query(`
    INSERT INTO public.scanner_pins (id, event_id, organizer_id, pin_code, pin_hash, staff_name, role, is_active)
    VALUES ($1, $2, $3, '123456', $4, 'Door Scanner 1', 'ORGANIZER', true)
    ON CONFLICT (id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, is_active = true
  `, [IDS.SCANNER_PIN_ID, IDS.PAID_EVENT_ID, IDS.ORGANIZER_ID, scannerPinHash]);
  console.log("  ✓ Scanner PIN: 123456 (hash stored)");

  await client.query(`
    INSERT INTO public.box_office_pins (id, event_id, organizer_id, pin_code, pin_hash, staff_name, role, is_active)
    VALUES ($1, $2, $3, '654321', $4, 'Box Office 1', 'ORGANIZER', true)
    ON CONFLICT (id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, is_active = true
  `, [IDS.BOX_OFFICE_PIN_ID, IDS.PAID_EVENT_ID, IDS.ORGANIZER_ID, boxOfficePinHash]);
  console.log("  ✓ Box-office PIN: 654321 (hash stored)");

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n✅ Seed complete!\n");
  console.log("Test data created:");
  console.log("  Users:    admin@outsiderr.test, organizer@outsiderr.test, user@outsiderr.test");
  console.log("  Events:   Free Cypher (Mumbai), Dance Battle (Delhi), Sold Out Gig (Kolkata)");
  console.log("  Tiers:    Entry (free), General (₹500), VIP (₹2000), Entry (sold out)");
  console.log("  Orders:   Online (₹510, CONFIRMED), Box-office (₹500, CONFIRMED)");
  console.log("  Tickets:  1 VALID, 1 USED");
  console.log("  PINs:     Scanner=123456, Box-office=654321");
  console.log("\nDeterministic IDs are in tests/fixtures.ts");

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
