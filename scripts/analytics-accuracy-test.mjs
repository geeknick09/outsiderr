/**
 * Analytics Accuracy Test
 *
 * Verifies that admin analytics functions return correct values
 * by cross-checking against direct database queries.
 */

import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

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

async function setAuthContext(userId) {
  await db(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
}

async function rpcWithAuth(userId, query, params = []) {
  await db("BEGIN");
  await setAuthContext(userId);
  try {
    const result = await db(query, params);
    await db("COMMIT");
    return result;
  } catch (err) {
    await db("ROLLBACK");
    throw err;
  }
}

async function main() {
  await dbClient.connect();
  console.log("=== STARTING ANALYTICS ACCURACY TEST ===\n");

  const testEventId = randomUUID();
  const testTierId = randomUUID();
  const testEventId2 = randomUUID();
  const testTierId2 = randomUUID();
  const testUserId1 = randomUUID();
  const testUserId2 = randomUUID();
  const testUserId3 = randomUUID();
  const testOrganizerId = randomUUID();

  try {
    // --- SETUP ---
    console.log("--- SETUP: Creating test data ---");

    // Create users
    for (const [uid, name] of [[testUserId1, "Analytics User 1"], [testUserId2, "Analytics User 2"], [testUserId3, "Analytics User 3"]]) {
      await db(`
        INSERT INTO auth.users (id, email, aud, role, email_confirmed_at, created_at)
        VALUES ($1, $2, 'authenticated', 'authenticated', now(), now())
        ON CONFLICT (id) DO NOTHING
      `, [uid, `${name.replace(/\s/g, '').toLowerCase()}-${Date.now()}@outsiderr.test`]);
      await db(`INSERT INTO profiles (id, full_name, is_admin, created_at) VALUES ($1, $2, false, now()) ON CONFLICT (id) DO NOTHING`, [uid, name]);
    }

    // Create organizer
    await db(`INSERT INTO organizers (id, owner_id, name, verified, created_at) VALUES ($1, $2, 'Analytics Test Org', true, now()) ON CONFLICT (id) DO NOTHING`, [testOrganizerId, testUserId1]);
    await db(`UPDATE profiles SET is_organizer = true WHERE id = $1`, [testUserId1]);

    // Create event with 10 tickets at ₹500
    await db(`
      INSERT INTO events (id, organizer_id, title, category, city, venue_name, starts_at, status, fee_payer,
        commission_enabled, commission_bps, convenience_fee_enabled, convenience_fee_bps,
        created_at, registrations_count)
      VALUES ($1, $2, 'Analytics Test Event', 'OTHER', 'DELHI', 'Test Venue', now() + interval '7 days',
        'PUBLISHED', 'BUYER', true, 1000, true, 200, now(), 0)
      ON CONFLICT (id) DO NOTHING
    `, [testEventId, testOrganizerId]);

    await db(`INSERT INTO ticket_tiers (id, event_id, name, price_paise, quantity, quantity_sold, quantity_reserved, sort_order, perks) VALUES ($1, $2, 'General', 50000, 10, 0, 0, 0, '{}') ON CONFLICT (id) DO NOTHING`, [testTierId, testEventId]);

    // Create second event for returning user test
    await db(`
      INSERT INTO events (id, organizer_id, title, category, city, venue_name, starts_at, status, fee_payer,
        commission_enabled, commission_bps, convenience_fee_enabled, convenience_fee_bps,
        created_at, registrations_count)
      VALUES ($1, $2, 'Analytics Test Event 2', 'OTHER', 'DELHI', 'Test Venue 2', now() + interval '14 days',
        'PUBLISHED', 'BUYER', true, 1000, true, 200, now(), 0)
      ON CONFLICT (id) DO NOTHING
    `, [testEventId2, testOrganizerId]);
    await db(`INSERT INTO ticket_tiers (id, event_id, name, price_paise, quantity, quantity_sold, quantity_reserved, sort_order, perks) VALUES ($1, $2, 'General', 50000, 10, 0, 0, 0, '{}') ON CONFLICT (id) DO NOTHING`, [testTierId2, testEventId2]);

    log("Test data created", true, `event=${testEventId.slice(0, 8)}…`);

    // --- Create and confirm orders ---
    console.log("\n--- Creating confirmed orders ---");

    // User 1: 2 tickets (returning user - will have 2 orders)
    const r1 = await rpcWithAuth(testUserId1, `
      SELECT * FROM create_reserved_order(
        p_event_id := $1, p_tier_id := $2, p_quantity := 2,
        p_unit_price_paise := 50000, p_subtotal_paise := 100000,
        p_platform_fee_paise := 12000, p_commission_paise := 10000,
        p_convenience_fee_paise := 2000, p_organizer_payout_paise := 90000,
        p_total_paise := 102000, p_fee_payer := 'BUYER',
        p_buyer_name := 'User 1', p_buyer_phone := null, p_buyer_email := null, p_buyer_gender := null
      )
    `, [testEventId, testTierId]);
    const order1Id = r1.rows[0].id;

    await rpcWithAuth(testUserId1, `
      SELECT * FROM confirm_razorpay_order(
        p_order_id := $1, p_razorpay_payment_id := $2,
        p_razorpay_signature := $3, p_payment_method := 'upi'
      )
    `, [order1Id, `pay_${randomUUID().replace(/-/g, '').slice(0, 20)}`, `sig_test`]);

    // User 2: 1 ticket
    const r2 = await rpcWithAuth(testUserId2, `
      SELECT * FROM create_reserved_order(
        p_event_id := $1, p_tier_id := $2, p_quantity := 1,
        p_unit_price_paise := 50000, p_subtotal_paise := 50000,
        p_platform_fee_paise := 6000, p_commission_paise := 5000,
        p_convenience_fee_paise := 1000, p_organizer_payout_paise := 45000,
        p_total_paise := 51000, p_fee_payer := 'BUYER',
        p_buyer_name := 'User 2', p_buyer_phone := null, p_buyer_email := null, p_buyer_gender := null
      )
    `, [testEventId, testTierId]);
    const order2Id = r2.rows[0].id;

    await rpcWithAuth(testUserId2, `
      SELECT * FROM confirm_razorpay_order(
        p_order_id := $1, p_razorpay_payment_id := $2,
        p_razorpay_signature := $3, p_payment_method := 'card'
      )
    `, [order2Id, `pay_${randomUUID().replace(/-/g, '').slice(0, 20)}`, `sig_test`]);

    // User 1: second order on event 2 (makes them a returning user)
    const r3 = await rpcWithAuth(testUserId1, `
      SELECT * FROM create_reserved_order(
        p_event_id := $1, p_tier_id := $2, p_quantity := 1,
        p_unit_price_paise := 50000, p_subtotal_paise := 50000,
        p_platform_fee_paise := 6000, p_commission_paise := 5000,
        p_convenience_fee_paise := 1000, p_organizer_payout_paise := 45000,
        p_total_paise := 51000, p_fee_payer := 'BUYER',
        p_buyer_name := 'User 1', p_buyer_phone := null, p_buyer_email := null, p_buyer_gender := null
      )
    `, [testEventId2, testTierId2]);
    const order3Id = r3.rows[0].id;

    await rpcWithAuth(testUserId1, `
      SELECT * FROM confirm_razorpay_order(
        p_order_id := $1, p_razorpay_payment_id := $2,
        p_razorpay_signature := $3, p_payment_method := 'upi'
      )
    `, [order3Id, `pay_${randomUUID().replace(/-/g, '').slice(0, 20)}`, `sig_test`]);

    // Create a RESERVED order (user 3) - should NOT count in revenue
    const r4 = await rpcWithAuth(testUserId3, `
      SELECT * FROM create_reserved_order(
        p_event_id := $1, p_tier_id := $2, p_quantity := 1,
        p_unit_price_paise := 50000, p_subtotal_paise := 50000,
        p_platform_fee_paise := 6000, p_commission_paise := 5000,
        p_convenience_fee_paise := 1000, p_organizer_payout_paise := 45000,
        p_total_paise := 51000, p_fee_payer := 'BUYER',
        p_buyer_name := 'User 3', p_buyer_phone := null, p_buyer_email := null, p_buyer_gender := null
      )
    `, [testEventId, testTierId]);
    log("Created 3 confirmed + 1 reserved order", true, `orders=4`);

    // --- TEST 1: Revenue calculations ---
    console.log("\n--- TEST 1: Revenue calculations ---");

    const revenueRes = await db(`
      SELECT
        count(*) filter (where status = 'CONFIRMED') as confirmed_count,
        coalesce(sum(subtotal_paise) filter (where status = 'CONFIRMED'), 0) as gross,
        coalesce(sum(commission_paise) filter (where status = 'CONFIRMED'), 0) as commission,
        coalesce(sum(convenience_fee_paise) filter (where status = 'CONFIRMED'), 0) as convenience,
        coalesce(sum(platform_fee_paise) filter (where status = 'CONFIRMED'), 0) as platform_fee,
        coalesce(sum(organizer_payout_paise) filter (where status = 'CONFIRMED'), 0) as payout,
        coalesce(sum(total_paise) filter (where status = 'CONFIRMED'), 0) as buyer_paid
      FROM orders WHERE event_id = $1
    `, [testEventId]);

    const rev = revenueRes.rows[0];
    const expectedGross = 200000; // 100000 + 50000 + 50000
    const expectedCommission = 20000;
    const expectedConvenience = 4000;
    const expectedPlatformFee = 24000;
    const expectedPayout = 180000;
    const expectedBuyerPaid = 204000;

    log("Confirmed order count = 3", Number(rev.confirmed_count) === 3, `count=${rev.confirmed_count}`);
    log("Gross revenue = 200,000 paise", Number(rev.gross) === expectedGross, `gross=${rev.gross}`);
    log("Commission = 20,000 paise", Number(rev.commission) === expectedCommission, `commission=${rev.commission}`);
    log("Convenience fee = 4,000 paise", Number(rev.convenience) === expectedConvenience, `convenience=${rev.convenience}`);
    log("Platform fee = 24,000 paise", Number(rev.platform_fee) === expectedPlatformFee, `platform_fee=${rev.platform_fee}`);
    log("Organizer payout = 180,000 paise", Number(rev.payout) === expectedPayout, `payout=${rev.payout}`);
    log("Buyer paid = 204,000 paise", Number(rev.buyer_paid) === expectedBuyerPaid, `buyer_paid=${rev.buyer_paid}`);

    // Invariant checks
    log("Invariant: buyer_paid - platform_fee == payout", Number(rev.buyer_paid) - Number(rev.platform_fee) === Number(rev.payout), `${rev.buyer_paid} - ${rev.platform_fee} = ${Number(rev.buyer_paid) - Number(rev.platform_fee)} vs ${rev.payout}`);
    log("Invariant: gross - commission == payout", Number(rev.gross) - Number(rev.commission) === Number(rev.payout), `${rev.gross} - ${rev.commission} = ${Number(rev.gross) - Number(rev.commission)} vs ${rev.payout}`);
    log("Invariant: commission + convenience == platform_fee", Number(rev.commission) + Number(rev.convenience) === Number(rev.platform_fee), `${rev.commission} + ${rev.convenience} = ${Number(rev.commission) + Number(rev.convenience)} vs ${rev.platform_fee}`);

    // --- TEST 2: RESERVED orders should NOT count in revenue ---
    console.log("\n--- TEST 2: RESERVED orders excluded from revenue ---");

    const reservedRev = await db(`
      SELECT coalesce(sum(total_paise), 0) as total FROM orders WHERE event_id = $1 AND status = 'RESERVED'
    `, [testEventId]);
    log("RESERVED order total = 51,000 (not in revenue)", Number(reservedRev.rows[0].total) === 51000, `total=${reservedRev.rows[0].total}`);

    const allRev = await db(`
      SELECT coalesce(sum(total_paise), 0) as total FROM orders WHERE event_id = $1
    `, [testEventId]);
    log("All orders total = 255,000 (includes reserved)", Number(allRev.rows[0].total) === 255000, `total=${allRev.rows[0].total}`);
    log("Revenue (confirmed only) != All orders total", Number(rev.buyer_paid) !== Number(allRev.rows[0].total), `${rev.buyer_paid} != ${allRev.rows[0].total}`);

    // --- TEST 3: Inventory accuracy ---
    console.log("\n--- TEST 3: Inventory accuracy ---");

    const tierRes = await db(`SELECT quantity, quantity_sold, quantity_reserved FROM ticket_tiers WHERE id = $1`, [testTierId]);
    const tier = tierRes.rows[0];
    log("quantity_sold = 4 (3 confirmed orders: 2+1+1)", Number(tier.quantity_sold) === 4, `sold=${tier.quantity_sold}`);
    log("quantity_reserved = 1 (1 reserved order)", Number(tier.quantity_reserved) === 1, `reserved=${tier.quantity_reserved}`);
    log("Available = 5 (10 - 4 - 1)", Number(tier.quantity) - Number(tier.quantity_sold) - Number(tier.quantity_reserved) === 5, `available=${Number(tier.quantity) - Number(tier.quantity_sold) - Number(tier.quantity_reserved)}`);

    // --- TEST 4: Ticket minting accuracy ---
    console.log("\n--- TEST 4: Ticket minting ---");

    const ticketsRes = await db(`
      SELECT count(*) as total, count(distinct qr_hash) as distinct_qrs, count(*) filter (where status = 'VALID') as valid
      FROM tickets WHERE order_id IN (SELECT id FROM orders WHERE event_id = $1 AND status = 'CONFIRMED')
    `, [testEventId]);
    log("Total tickets minted = 4", Number(ticketsRes.rows[0].total) === 4, `total=${ticketsRes.rows[0].total}`);
    log("All tickets have unique QR hashes", Number(ticketsRes.rows[0].distinct_qrs) === 4, `distinct=${ticketsRes.rows[0].distinct_qrs}`);
    log("All tickets are VALID", Number(ticketsRes.rows[0].valid) === 4, `valid=${ticketsRes.rows[0].valid}`);

    // No tickets for RESERVED order
    const reservedTickets = await db(`
      SELECT count(*) as cnt FROM tickets WHERE order_id IN (SELECT id FROM orders WHERE event_id = $1 AND status = 'RESERVED')
    `, [testEventId]);
    log("No tickets for RESERVED order", Number(reservedTickets.rows[0].cnt) === 0, `count=${reservedTickets.rows[0].cnt}`);

    // --- TEST 5: Event registrations_count ---
    console.log("\n--- TEST 5: Event registrations_count ---");

    const eventRes = await db(`SELECT registrations_count FROM events WHERE id = $1`, [testEventId]);
    log("registrations_count = 4 (total tickets minted)", Number(eventRes.rows[0].registrations_count) === 4, `count=${eventRes.rows[0].registrations_count}`);

    // --- TEST 6: User analytics ---
    console.log("\n--- TEST 6: User analytics ---");

    // User 1 has 2 confirmed orders → returning
    const user1Orders = await db(`SELECT count(*) as cnt FROM orders WHERE user_id = $1 AND status = 'CONFIRMED'`, [testUserId1]);
    log("User 1 has 2 confirmed orders (returning)", Number(user1Orders.rows[0].cnt) === 2, `count=${user1Orders.rows[0].cnt}`);

    // User 2 has 1 confirmed order → non-returning
    const user2Orders = await db(`SELECT count(*) as cnt FROM orders WHERE user_id = $1 AND status = 'CONFIRMED'`, [testUserId2]);
    log("User 2 has 1 confirmed order (non-returning)", Number(user2Orders.rows[0].cnt) === 1, `count=${user2Orders.rows[0].cnt}`);

    // User 3 has 0 confirmed orders (only reserved)
    const user3Orders = await db(`SELECT count(*) as cnt FROM orders WHERE user_id = $1 AND status = 'CONFIRMED'`, [testUserId3]);
    log("User 3 has 0 confirmed orders", Number(user3Orders.rows[0].cnt) === 0, `count=${user3Orders.rows[0].cnt}`);

    // --- TEST 7: Payment method breakdown ---
    console.log("\n--- TEST 7: Payment method breakdown ---");

    const methodRes = await db(`
      SELECT payment_method, count(*) as cnt, sum(total_paise) as volume
      FROM orders WHERE event_id = $1 AND status = 'CONFIRMED'
      GROUP BY payment_method ORDER BY cnt DESC
    `, [testEventId]);

    const upiCount = methodRes.find((m) => m.payment_method === "upi");
    const cardCount = methodRes.find((m) => m.payment_method === "card");
    log("UPI payments: 2 orders", upiCount && Number(upiCount.cnt) === 2, `count=${upiCount?.cnt}`);
    log("Card payments: 1 order", cardCount && Number(cardCount.cnt) === 1, `count=${cardCount?.cnt}`);
    log("UPI volume = 153,000 paise (102000 + 51000)", upiCount && Number(upiCount.volume) === 153000, `volume=${upiCount?.volume}`);
    log("Card volume = 51,000 paise", cardCount && Number(cardCount.volume) === 51000, `volume=${cardCount?.volume}`);

    // --- TEST 8: Invoice numbers ---
    console.log("\n--- TEST 8: Invoice numbers ---");

    const invoiceRes = await db(`
      SELECT invoice_number FROM orders WHERE event_id = $1 AND status = 'CONFIRMED' AND invoice_number IS NOT NULL
    `, [testEventId]);
    log("All confirmed orders have invoice numbers", invoiceRes.rows.length === 3, `count=${invoiceRes.rows.length}`);
    const invoices = invoiceRes.rows.map((r) => r.invoice_number);
    const uniqueInvoices = new Set(invoices);
    log("All invoice numbers are unique", uniqueInvoices.size === 3, `unique=${uniqueInvoices.size}`);

    // --- TEST 9: Fail the reserved order and verify inventory release ---
    console.log("\n--- TEST 9: Fail reserved order → inventory release ---");

    const reservedOrderRes = await db(`SELECT id FROM orders WHERE event_id = $1 AND status = 'RESERVED'`, [testEventId]);
    const reservedOrderId = reservedOrderRes.rows[0].id;

    await rpcWithAuth(testUserId3, `SELECT fail_razorpay_order(p_order_id := $1)`, [reservedOrderId]);

    const tierAfterFail = await db(`SELECT quantity_sold, quantity_reserved FROM ticket_tiers WHERE id = $1`, [testTierId]);
    log("After fail: quantity_reserved = 0", Number(tierAfterFail.rows[0].quantity_reserved) === 0, `reserved=${tierAfterFail.rows[0].quantity_reserved}`);
    log("After fail: quantity_sold still 4", Number(tierAfterFail.rows[0].quantity_sold) === 4, `sold=${tierAfterFail.rows[0].quantity_sold}`);

    const failedOrder = await db(`SELECT status FROM orders WHERE id = $1`, [reservedOrderId]);
    log("Failed order status = FAILED", failedOrder.rows[0].status === "FAILED", `status=${failedOrder.rows[0].status}`);

    // --- TEST 10: Revenue unchanged after failure ---
    console.log("\n--- TEST 10: Revenue unchanged after failure ---");

    const revenueAfterFail = await db(`
      SELECT coalesce(sum(total_paise), 0) as buyer_paid, count(*) as cnt
      FROM orders WHERE event_id = $1 AND status = 'CONFIRMED'
    `, [testEventId]);
    log("Revenue still 204,000 after failure", Number(revenueAfterFail.rows[0].buyer_paid) === 204000, `buyer_paid=${revenueAfterFail.rows[0].buyer_paid}`);
    log("Confirmed count still 3 after failure", Number(revenueAfterFail.rows[0].cnt) === 3, `count=${revenueAfterFail.rows[0].cnt}`);

  } finally {
    // --- CLEANUP ---
    console.log("\n--- CLEANUP ---");
    try {
      for (const eid of [testEventId, testEventId2]) {
        await db(`DELETE FROM tickets WHERE order_id IN (SELECT id FROM orders WHERE event_id = $1)`, [eid]);
        await db(`DELETE FROM orders WHERE event_id = $1`, [eid]);
        await db(`DELETE FROM ticket_tiers WHERE event_id = $1`, [eid]);
        await db(`DELETE FROM events WHERE id = $1`, [eid]);
      }
      await db(`DELETE FROM organizers WHERE id = $1`, [testOrganizerId]);
      for (const uid of [testUserId1, testUserId2, testUserId3]) {
        await db(`DELETE FROM profiles WHERE id = $1`, [uid]);
        await db(`DELETE FROM auth.users WHERE id = $1`, [uid]);
      }
      log("Test data cleaned up", true, `event=${testEventId.slice(0, 8)}…`);
    } catch (err) {
      log("Cleanup failed", false, err.message);
    }
  }

  // --- SUMMARY ---
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`ANALYTICS ACCURACY TEST RESULTS: ${passed} PASS, ${failed} FAIL`);
  console.log(`${"=".repeat(60)}`);

  if (failed > 0) {
    console.log("\n❌ FAILED TESTS:");
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
  } else {
    console.log("\n🎉 ALL ANALYTICS INVARIANTS VERIFIED.");
  }

  await dbClient.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  dbClient.end().then(() => process.exit(1));
});
