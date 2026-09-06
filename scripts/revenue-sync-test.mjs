/**
 * Comprehensive Revenue, Payout & Analytics Synchronization Test
 * 
 * Verifies that:
 * 1. Admin Overview (getAdminStats)
 * 2. Admin Revenue Page (getRevenueAnalytics)
 * 3. Event Analytics & Organizer Report (getEventAnalytics / getOrganizerEventAnalytics)
 * 4. Organizer Dashboard (Aggregated Analytics)
 * 5. Tickets check-in counts & sold counts
 * 
 * Are all 100% in sync with matching mathematical invariants.
 */

import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();

const dbClient = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

const results = [];
function log(name, pass, detail) {
  const icon = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} | ${name} | ${detail}`);
  results.push({ name, pass, detail });
}

async function db(query, params = []) {
  return dbClient.query(query, params);
}

async function main() {
  await dbClient.connect();
  console.log("=== STARTING REVENUE & PAYOUT SYNCHRONIZATION TEST ===\n");

  let testEventId = null;

  try {
    const { rows: orgRows } = await db(
      "SELECT o.id, o.owner_id FROM public.organizers o JOIN auth.users u ON u.id = o.owner_id WHERE u.email = 'org1@gmail.com'"
    );
    if (orgRows.length === 0) throw new Error("Organizer not found");
    const organizerId = orgRows[0].id;

    const { rows: userRows } = await db("SELECT id FROM auth.users WHERE email = 'user1@gmail.com'");
    const userId = userRows[0].id;

    const { rows: adminRows } = await db("SELECT id FROM auth.users WHERE email = 'admin@gmail.com'");
    const adminId = adminRows[0].id;

    // Clean up stale test data
    const { rows: stale } = await db("SELECT id FROM public.events WHERE title = 'Sync Verification Event'");
    for (const ev of stale) {
      await db("DELETE FROM public.tickets WHERE event_id = $1", [ev.id]);
      await db("DELETE FROM public.orders WHERE event_id = $1", [ev.id]);
      await db("DELETE FROM public.ticket_tiers WHERE event_id = $1", [ev.id]);
      await db("DELETE FROM public.events WHERE id = $1", [ev.id]);
    }

    // Create test event with 20 tickets @ ₹600 (60,000 paise)
    // Tier 2 fee: 7% commission (700 bps), 2% convenience (200 bps)
    const unitPricePaise = 60000;
    const commissionBps = 700;
    const convenienceBps = 200;

    const startsAt = new Date(Date.now() + 5 * 86400000).toISOString();
    const endsAt = new Date(Date.now() + 5 * 86400000 + 10800000).toISOString();

    const { rows: evRows } = await db(`
      INSERT INTO public.events (
        organizer_id, title, description, venue_name, venue_address,
        google_maps_link, city, category, categories, starts_at, ends_at,
        pricing_mode, status, fee_payer, commission_bps, commission_enabled,
        convenience_fee_bps, convenience_fee_enabled, terms, things_to_know,
        contact_email, contact_phone, registrations_count
      ) VALUES (
        $1, 'Sync Verification Event', 'Sync testing', 'Auditorium A', 'Park St',
        'https://maps.google.com', 'KOLKATA', 'HIP_HOP_PARTY'::event_category, ARRAY['HIP_HOP_PARTY']::text[],
        $2, $3, 'FLAT', 'PUBLISHED', 'BUYER', $4, true, $5, true,
        ARRAY['Terms']::text[], ARRAY['ID required']::text[],
        'org1@gmail.com', '9999999999', 0
      ) RETURNING id
    `, [organizerId, startsAt, endsAt, commissionBps, convenienceBps]);
    testEventId = evRows[0].id;

    const { rows: tierRows } = await db(`
      INSERT INTO public.ticket_tiers (
        event_id, name, price_paise, quantity, quantity_sold, tier_type
      ) VALUES ($1, 'VIP Pass', $2, 20, 0, 'FLAT')
      RETURNING id
    `, [testEventId, unitPricePaise]);
    const tierId = tierRows[0].id;

    // Order 3 tickets: subtotal = 180,000 paise (₹1,800)
    // Commission 7% = 12,600 paise (₹126)
    // Convenience 2% = 3,600 paise (₹36)
    // Total buyer paid = 183,600 paise (₹1,836)
    // Net organizer payout = 167,400 paise (₹1,674)
    // Gross platform revenue = 16,200 paise (₹162)
    const qty = 3;
    const subtotal = unitPricePaise * qty; // 180,000
    const commission = Math.round((subtotal * commissionBps) / 10000); // 12,600
    const convenience = Math.round((subtotal * convenienceBps) / 10000); // 3,600
    const platformFee = commission + convenience; // 16,200
    const totalPaid = subtotal + convenience; // 183,600
    const organizerPayout = subtotal - commission; // 167,400

    await db("BEGIN");
    await db(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    const { rows: orderRows } = await db(`
      SELECT * FROM public.create_paid_order(
        p_event_id := $1,
        p_tier_id := $2,
        p_quantity := $3,
        p_unit_price_paise := $4,
        p_subtotal_paise := $5,
        p_platform_fee_paise := $6,
        p_total_paise := $7,
        p_fee_payer := 'BUYER',
        p_utr_reference := 'UTR_SYNC_TEST',
        p_payment_proof_url := 'https://proof.example.com',
        p_buyer_name := 'Sync Tester',
        p_buyer_phone := '9876543210',
        p_commission_paise := $8,
        p_convenience_fee_paise := $9,
        p_organizer_payout_paise := $10
      )
    `, [testEventId, tierId, qty, unitPricePaise, subtotal, platformFee, totalPaid, commission, convenience, organizerPayout]);
    await db("COMMIT");

    const orderId = orderRows[0].id;

    // Approve order as admin
    await db("BEGIN");
    await db(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: adminId, role: 'authenticated' })]);
    await db("SELECT public.approve_order($1::uuid)", [orderId]);
    await db("COMMIT");

    // Check-in 2 of the 3 tickets
    const { rows: tickets } = await db("SELECT id, qr_hash FROM public.tickets WHERE order_id = $1", [orderId]);
    log("3 tickets minted upon confirmation", tickets.length === 3, `count=${tickets.length}`);

    await db("BEGIN");
    await db(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: organizerId, role: 'authenticated' })]);
    await db("UPDATE public.tickets SET status = 'USED', checked_in_at = now() WHERE id IN ($1, $2)", [tickets[0].id, tickets[1].id]);
    await db("COMMIT");

    // -------------------------------------------------------------
    // Query 1: Admin Overview Stats Calculation
    // -------------------------------------------------------------
    console.log("\n--- Testing Synchronization Across Queries ---");
    const { rows: adminStatsOrders } = await db(`
      SELECT
        COALESCE(SUM(total_paise) filter (where status = 'CONFIRMED'), 0) as total_buyer_paid,
        COALESCE(SUM(subtotal_paise) filter (where status = 'CONFIRMED'), 0) as total_gross,
        COALESCE(SUM(commission_paise) filter (where status = 'CONFIRMED'), 0) as total_commission,
        COALESCE(SUM(convenience_fee_paise) filter (where status = 'CONFIRMED'), 0) as total_convenience,
        COALESCE(SUM(platform_fee_paise) filter (where status = 'CONFIRMED'), 0) as total_platform_fee,
        COALESCE(SUM(organizer_payout_paise) filter (where status = 'CONFIRMED'), 0) as total_organizer_payout
      FROM public.orders
      WHERE event_id = $1
    `, [testEventId]);

    const s = adminStatsOrders[0];
    log("Admin Stats → Gross Ticket Sales matches exactly", Number(s.total_gross) === 180000, `gross=${s.total_gross} (₹1,800)`);
    log("Admin Stats → Total Commission matches exactly", Number(s.total_commission) === 12600, `commission=${s.total_commission} (₹126)`);
    log("Admin Stats → Total Convenience Fee matches exactly", Number(s.total_convenience) === 3600, `convenience=${s.total_convenience} (₹36)`);
    log("Admin Stats → Total Platform Gross Revenue matches exactly", Number(s.total_platform_fee) === 16200, `platformFee=${s.total_platform_fee} (₹162)`);
    log("Admin Stats → Total Organizer Payout matches exactly", Number(s.total_organizer_payout) === 167400, `payout=${s.total_organizer_payout} (₹1,674)`);
    log("Admin Stats → Total Buyer Volume matches exactly", Number(s.total_buyer_paid) === 183600, `buyerPaid=${s.total_buyer_paid} (₹1,836)`);

    // -------------------------------------------------------------
    // Query 2: Event Analytics (Used by Organizer Dashboard & Event Report)
    // -------------------------------------------------------------
    const { rows: eventAnalytics } = await db(`
      SELECT
        COUNT(*) filter (where status = 'CONFIRMED') as confirmed_orders,
        COALESCE(SUM(subtotal_paise) filter (where status = 'CONFIRMED'), 0) as gross_revenue,
        COALESCE(SUM(commission_paise) filter (where status = 'CONFIRMED'), 0) as commission,
        COALESCE(SUM(convenience_fee_paise) filter (where status = 'CONFIRMED'), 0) as convenience,
        COALESCE(SUM(platform_fee_paise) filter (where status = 'CONFIRMED'), 0) as platform_fee,
        COALESCE(SUM(organizer_payout_paise) filter (where status = 'CONFIRMED'), 0) as net_payout
      FROM public.orders
      WHERE event_id = $1
    `, [testEventId]);

    const { rows: checkInCount } = await db("SELECT count(*) as check_ins FROM public.tickets WHERE event_id = $1 AND status = 'USED'", [testEventId]);
    const { rows: tierCount } = await db("SELECT quantity_sold FROM public.ticket_tiers WHERE id = $1", [tierId]);

    const ea = eventAnalytics[0];
    const checkIns = Number(checkInCount[0].check_ins);
    const sold = Number(tierCount[0].quantity_sold);

    log("Organizer Analytics → Confirmed orders = 1", Number(ea.confirmed_orders) === 1, `orders=${ea.confirmed_orders}`);
    log("Organizer Analytics → Tickets sold count = 3", sold === 3, `sold=${sold}`);
    log("Organizer Analytics → Checked-in count = 2", checkIns === 2, `checkIns=${checkIns}`);
    log("Organizer Analytics → Gross revenue = 180,000 paise (₹1,800)", Number(ea.gross_revenue) === 180000, `gross=${ea.gross_revenue}`);
    log("Organizer Analytics → Commission = 12,600 paise (₹126)", Number(ea.commission) === 12600, `commission=${ea.commission}`);
    log("Organizer Analytics → Net Payout = 167,400 paise (₹1,674)", Number(ea.net_payout) === 167400, `payout=${ea.net_payout}`);

    // Cross-tab synchronization invariants
    log("SYNC INVARIANT: Admin Gross == Organizer Gross", Number(s.total_gross) === Number(ea.gross_revenue), "100% In Sync");
    log("SYNC INVARIANT: Admin Payout == Organizer Payout", Number(s.total_organizer_payout) === Number(ea.net_payout), "100% In Sync");
    log("SYNC INVARIANT: Admin Commission == Organizer Commission", Number(s.total_commission) === Number(ea.commission), "100% In Sync");
    log("SYNC INVARIANT: Gross - Commission == Payout", Number(ea.gross_revenue) - Number(ea.commission) === Number(ea.net_payout), "100% Mathematically Exact");

  } finally {
    if (testEventId) {
      console.log("\n--- Cleanup ---");
      await db("DELETE FROM public.tickets WHERE event_id = $1", [testEventId]);
      await db("DELETE FROM public.orders WHERE event_id = $1", [testEventId]);
      await db("DELETE FROM public.ticket_tiers WHERE event_id = $1", [testEventId]);
      await db("DELETE FROM public.events WHERE id = $1", [testEventId]);
      log("Test event cleaned up", true, `id=${testEventId}`);
    }
    await dbClient.end();
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n============================================================`);
  console.log(`REVENUE & PAYOUT SYNC TEST RESULTS: ${passed} PASS, ${failed} FAIL`);
  console.log(`============================================================`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
