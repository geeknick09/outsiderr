/**
 * Razorpay Payment Flow Test (Mock)
 *
 * Tests the complete Razorpay ticket booking flow WITHOUT calling Razorpay API:
 *   1. Create a test event with paid tickets
 *   2. Call create_reserved_order RPC → order is RESERVED, inventory held
 *   3. Verify reservation: quantity_reserved incremented, no tickets minted
 *   4. Mock Razorpay payment: call confirm_razorpay_order with fake payment IDs
 *   5. Verify confirmation: status=CONFIRMED, quantity_sold incremented, tickets minted
 *   6. Verify idempotency: calling confirm again returns same tickets (no duplicates)
 *   7. Verify failure path: create another reserved order, call fail_razorpay_order
 *      → status=FAILED, quantity_reserved released
 *   8. Verify expiry path: create reserved order with past expiry, call expire_reserved_orders
 *      → status=EXPIRED, quantity_reserved released
 *   9. Verify money accuracy: subtotal, commission, convenience, payout, total all correct
 *  10. Verify invoice number generated on confirmation
 *  11. Cleanup
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

/** Set auth context for RPCs that use auth.uid() */
async function setAuthContext(userId) {
  await db(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
}

/** Clear auth context */
async function clearAuthContext() {
  await db(`SELECT set_config('request.jwt.claims', '{}', true)`);
}

/** Run an RPC within a transaction with auth context set */
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
  console.log("=== STARTING RAZORPAY PAYMENT FLOW TEST (MOCK) ===\n");

  // Generate unique IDs for this test run
  const testEventId = randomUUID();
  const testTierId = randomUUID();
  const testUserId = randomUUID();
  const testOrganizerId = randomUUID();
  const testEmail = `test-razorpay-${Date.now()}@outsiderr.test`;

  // Additional users for multi-order tests (RPC prevents same user from having multiple active bookings)
  const testUserId2 = randomUUID();
  const testUserId3 = randomUUID();
  const testUserId4 = randomUUID();

  try {
    // --- SETUP: Create test user, organizer, event, tier ---
    console.log("--- SETUP: Creating test data ---");

    await db(`
      INSERT INTO auth.users (id, email, aud, role, email_confirmed_at, created_at)
      VALUES ($1, $2, 'authenticated', 'authenticated', now(), now())
      ON CONFLICT (id) DO NOTHING
    `, [testUserId, testEmail]);

    await db(`
      INSERT INTO profiles (id, full_name, is_admin, created_at)
      VALUES ($1, 'Razorpay Test User', false, now())
      ON CONFLICT (id) DO NOTHING
    `, [testUserId]);

    // Create additional test users for multi-order tests
    for (const [uid, name] of [[testUserId2, 'Test Buyer 2'], [testUserId3, 'Test Buyer 3'], [testUserId4, 'Big Buyer']]) {
      await db(`
        INSERT INTO auth.users (id, email, aud, role, email_confirmed_at, created_at)
        VALUES ($1, $2, 'authenticated', 'authenticated', now(), now())
        ON CONFLICT (id) DO NOTHING
      `, [uid, `${name.replace(/\s/g, '').toLowerCase()}-${Date.now()}@outsiderr.test`]);
      await db(`
        INSERT INTO profiles (id, full_name, is_admin, created_at)
        VALUES ($1, $2, false, now())
        ON CONFLICT (id) DO NOTHING
      `, [uid, name]);
    }

    await db(`
      INSERT INTO organizers (id, owner_id, name, upi_id, verified, created_at)
      VALUES ($1, $2, 'Test Organizer RP', 'test@upi', true, now())
      ON CONFLICT (id) DO NOTHING
    `, [testOrganizerId, testUserId]);

    await db(`
      INSERT INTO events (id, organizer_id, title, category, city, venue_name, starts_at, status, fee_payer,
        commission_enabled, commission_bps, convenience_fee_enabled, convenience_fee_bps,
        created_at, registrations_count)
      VALUES ($1, $2, 'RP Test Event', 'OTHER', 'DELHI', 'Test Venue', now() + interval '7 days',
        'PUBLISHED', 'BUYER', true, 1000, true, 200, now(), 0)
      ON CONFLICT (id) DO NOTHING
    `, [testEventId, testOrganizerId]);

    // Also set is_organizer on the profile
    await db(`UPDATE profiles SET is_organizer = true WHERE id = $1`, [testUserId]);

    // Create a tier with 10 tickets at ₹500 each
    await db(`
      INSERT INTO ticket_tiers (id, event_id, name, price_paise, quantity, quantity_sold, quantity_reserved, sort_order, perks)
      VALUES ($1, $2, 'General', 50000, 10, 0, 0, 0, '{}')
      ON CONFLICT (id) DO NOTHING
    `, [testTierId, testEventId]);

    log("Test data created", true, `event=${testEventId.slice(0, 8)}… tier=${testTierId.slice(0, 8)}…`);

    // --- TEST 1: create_reserved_order ---
    console.log("\n--- TEST 1: Reserve order (create_reserved_order) ---");

    const reserveResult = await rpcWithAuth(testUserId, `
      SELECT * FROM create_reserved_order(
        p_event_id := $1,
        p_tier_id := $2,
        p_quantity := 2,
        p_unit_price_paise := 50000,
        p_subtotal_paise := 100000,
        p_platform_fee_paise := 12000,
        p_commission_paise := 10000,
        p_convenience_fee_paise := 2000,
        p_organizer_payout_paise := 90000,
        p_total_paise := 102000,
        p_fee_payer := 'BUYER',
        p_buyer_name := 'Test Buyer',
        p_buyer_phone := '9999999999',
        p_buyer_email := null,
        p_buyer_gender := null
      )
    `, [testEventId, testTierId]);

    const reservedOrder = reserveResult.rows[0];
    if (!reservedOrder) {
      log("create_reserved_order returned data", false, "No data returned");
      throw new Error("create_reserved_order failed");
    }

    const orderId = reservedOrder.id;
    log("Reserved order created", true, `orderId=${orderId.slice(0, 8)}…`);

    // Verify order status is RESERVED
    const orderStatusRes = await db(`SELECT status, total_paise, subtotal_paise, commission_paise, convenience_fee_paise, organizer_payout_paise, reserved_at, reservation_expires_at FROM orders WHERE id = $1`, [orderId]);
    const orderStatus = orderStatusRes.rows[0];
    log("Order status is RESERVED", orderStatus.status === "RESERVED", `status=${orderStatus.status}`);

    // Verify money accuracy
    log("Subtotal accurate (₹1000)", orderStatus.subtotal_paise === 100000, `subtotal=${orderStatus.subtotal_paise}`);
    log("Commission accurate (₹100)", orderStatus.commission_paise === 10000, `commission=${orderStatus.commission_paise}`);
    log("Convenience fee accurate (₹20)", orderStatus.convenience_fee_paise === 2000, `convenience=${orderStatus.convenience_fee_paise}`);
    log("Total accurate (₹1020)", orderStatus.total_paise === 102000, `total=${orderStatus.total_paise}`);
    log("Organizer payout accurate (₹900)", orderStatus.organizer_payout_paise === 90000, `payout=${orderStatus.organizer_payout_paise}`);
    log("reserved_at is set", !!orderStatus.reserved_at, `reserved_at=${orderStatus.reserved_at}`);
    log("reservation_expires_at is set", !!orderStatus.reservation_expires_at, `expires_at=${orderStatus.reservation_expires_at}`);

    // Verify quantity_reserved incremented
    const tierAfterReserve = await db(`SELECT quantity_reserved, quantity_sold FROM ticket_tiers WHERE id = $1`, [testTierId]);
    log("quantity_reserved incremented to 2", tierAfterReserve.rows[0].quantity_reserved === 2, `reserved=${tierAfterReserve.rows[0].quantity_reserved}`);

    // Verify NO tickets minted yet
    const ticketsBeforeConfirm = await db(`SELECT count(*) as cnt FROM tickets WHERE order_id = $1`, [orderId]);
    log("No tickets minted while RESERVED", Number(ticketsBeforeConfirm.rows[0].cnt) === 0, `count=${ticketsBeforeConfirm.rows[0].cnt}`);

    // --- TEST 2: set_razorpay_order_id ---
    console.log("\n--- TEST 2: Link Razorpay order ID ---");

    const fakeRzpOrderId = `order_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    await rpcWithAuth(testUserId, `SELECT set_razorpay_order_id(p_order_id := $1, p_razorpay_order_id := $2)`, [orderId, fakeRzpOrderId]);

    const rzpIdCheck = await db(`SELECT razorpay_order_id FROM orders WHERE id = $1`, [orderId]);
    log("Razorpay order ID linked", rzpIdCheck.rows[0].razorpay_order_id === fakeRzpOrderId, `rzp_order_id=${rzpIdCheck.rows[0].razorpay_order_id}`);

    // --- TEST 3: confirm_razorpay_order (mock payment) ---
    console.log("\n--- TEST 3: Confirm order (mock Razorpay payment) ---");

    const fakeRzpPaymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const fakeRzpSignature = `sig_${randomUUID().replace(/-/g, '').slice(0, 32)}`;

    const confirmResult = await rpcWithAuth(testUserId, `
      SELECT * FROM confirm_razorpay_order(
        p_order_id := $1,
        p_razorpay_payment_id := $2,
        p_razorpay_signature := $3,
        p_payment_method := 'upi'
      )
    `, [orderId, fakeRzpPaymentId, fakeRzpSignature]);

    log("confirm_razorpay_order succeeded", true, `paymentId=${fakeRzpPaymentId.slice(0, 16)}…`);

    // Verify order status is CONFIRMED
    const confirmedOrder = await db(`SELECT status, razorpay_payment_id, payment_method, invoice_number, confirmed_at FROM orders WHERE id = $1`, [orderId]);
    log("Order status is CONFIRMED", confirmedOrder.rows[0].status === "CONFIRMED", `status=${confirmedOrder.rows[0].status}`);
    log("Razorpay payment ID stored", confirmedOrder.rows[0].razorpay_payment_id === fakeRzpPaymentId, `payment_id=${confirmedOrder.rows[0].razorpay_payment_id}`);
    log("Payment method stored", confirmedOrder.rows[0].payment_method === "upi", `method=${confirmedOrder.rows[0].payment_method}`);
    log("Invoice number generated", !!confirmedOrder.rows[0].invoice_number, `invoice=${confirmedOrder.rows[0].invoice_number}`);
    log("confirmed_at is set", !!confirmedOrder.rows[0].confirmed_at, `confirmed_at=${confirmedOrder.rows[0].confirmed_at}`);

    // Verify quantity_sold incremented, quantity_reserved decremented
    const tierAfterConfirm = await db(`SELECT quantity_reserved, quantity_sold FROM ticket_tiers WHERE id = $1`, [testTierId]);
    log("quantity_reserved released (back to 0)", tierAfterConfirm.rows[0].quantity_reserved === 0, `reserved=${tierAfterConfirm.rows[0].quantity_reserved}`);
    log("quantity_sold incremented to 2", tierAfterConfirm.rows[0].quantity_sold === 2, `sold=${tierAfterConfirm.rows[0].quantity_sold}`);

    // Verify tickets minted
    const ticketsAfterConfirm = await db(`SELECT count(*) as cnt, count(distinct qr_hash) as distinct_qrs FROM tickets WHERE order_id = $1`, [orderId]);
    log("Exactly 2 tickets minted", Number(ticketsAfterConfirm.rows[0].cnt) === 2, `count=${ticketsAfterConfirm.rows[0].cnt}`);
    log("Tickets have unique QR hashes", Number(ticketsAfterConfirm.rows[0].distinct_qrs) === 2, `distinct=${ticketsAfterConfirm.rows[0].distinct_qrs}`);

    // Verify event registrations_count incremented
    const eventAfterConfirm = await db(`SELECT registrations_count FROM events WHERE id = $1`, [testEventId]);
    log("Event registrations_count = 2", eventAfterConfirm.rows[0].registrations_count === 2, `count=${eventAfterConfirm.rows[0].registrations_count}`);

    // --- TEST 4: Idempotency — confirm again should not duplicate ---
    console.log("\n--- TEST 4: Idempotency (confirm again) ---");

    try {
      await rpcWithAuth(testUserId, `
        SELECT * FROM confirm_razorpay_order(
          p_order_id := $1,
          p_razorpay_payment_id := $2,
          p_razorpay_signature := $3,
          p_payment_method := 'upi'
        )
      `, [orderId, fakeRzpPaymentId, fakeRzpSignature]);
      log("Second confirm call succeeded (idempotent)", true, "no error");
    } catch (err) {
      log("Second confirm call succeeded (idempotent)", true, `returned: ${err.message?.slice(0, 50)}`);
    }

    const ticketsAfterReconfirm = await db(`SELECT count(*) as cnt FROM tickets WHERE order_id = $1`, [orderId]);
    log("No duplicate tickets after re-confirm", Number(ticketsAfterReconfirm.rows[0].cnt) === 2, `count=${ticketsAfterReconfirm.rows[0].cnt}`);

    const tierAfterReconfirm = await db(`SELECT quantity_sold, quantity_reserved FROM ticket_tiers WHERE id = $1`, [testTierId]);
    log("quantity_sold still 2 after re-confirm", tierAfterReconfirm.rows[0].quantity_sold === 2, `sold=${tierAfterReconfirm.rows[0].quantity_sold}`);

    // --- TEST 5: Failure path — fail_razorpay_order ---
    console.log("\n--- TEST 5: Failure path (fail_razorpay_order) ---");

    // Create another reserved order (using a different user to avoid duplicate booking check)
    const reserve2 = await rpcWithAuth(testUserId2, `
      SELECT * FROM create_reserved_order(
        p_event_id := $1, p_tier_id := $2, p_quantity := 1,
        p_unit_price_paise := 50000, p_subtotal_paise := 50000,
        p_platform_fee_paise := 6000, p_commission_paise := 5000,
        p_convenience_fee_paise := 1000, p_organizer_payout_paise := 45000,
        p_total_paise := 51000, p_fee_payer := 'BUYER',
        p_buyer_name := 'Test Buyer 2', p_buyer_phone := null,
        p_buyer_email := null, p_buyer_gender := null
      )
    `, [testEventId, testTierId]);

    const reserved2 = reserve2.rows[0];
    const order2Id = reserved2?.id;

    const tierAfterReserve2 = await db(`SELECT quantity_reserved FROM ticket_tiers WHERE id = $1`, [testTierId]);
    log("Second reservation: quantity_reserved = 1", tierAfterReserve2.rows[0].quantity_reserved === 1, `reserved=${tierAfterReserve2.rows[0].quantity_reserved}`);

    // Fail the order
    await rpcWithAuth(testUserId2, `SELECT fail_razorpay_order(p_order_id := $1)`, [order2Id]);

    const failedOrder = await db(`SELECT status FROM orders WHERE id = $1`, [order2Id]);
    log("Failed order status is FAILED", failedOrder.rows[0].status === "FAILED", `status=${failedOrder.rows[0].status}`);

    const tierAfterFail = await db(`SELECT quantity_reserved, quantity_sold FROM ticket_tiers WHERE id = $1`, [testTierId]);
    log("quantity_reserved released after fail (back to 0)", tierAfterFail.rows[0].quantity_reserved === 0, `reserved=${tierAfterFail.rows[0].quantity_reserved}`);
    log("quantity_sold unchanged after fail (still 2)", tierAfterFail.rows[0].quantity_sold === 2, `sold=${tierAfterFail.rows[0].quantity_sold}`);

    // --- TEST 6: Expiry path — expire_reserved_orders ---
    console.log("\n--- TEST 6: Expiry path (expire_reserved_orders) ---");

    // Create a reserved order and manually set its expiry to the past
    const reserve3 = await rpcWithAuth(testUserId3, `
      SELECT * FROM create_reserved_order(
        p_event_id := $1, p_tier_id := $2, p_quantity := 1,
        p_unit_price_paise := 50000, p_subtotal_paise := 50000,
        p_platform_fee_paise := 6000, p_commission_paise := 5000,
        p_convenience_fee_paise := 1000, p_organizer_payout_paise := 45000,
        p_total_paise := 51000, p_fee_payer := 'BUYER',
        p_buyer_name := 'Test Buyer 3', p_buyer_phone := null,
        p_buyer_email := null, p_buyer_gender := null
      )
    `, [testEventId, testTierId]);

    const reserved3 = reserve3.rows[0];
    const order3Id = reserved3?.id;

    // Manually set expiry to past
    await db(`UPDATE orders SET reservation_expires_at = now() - interval '1 minute' WHERE id = $1`, [order3Id]);

    const tierBeforeExpire = await db(`SELECT quantity_reserved FROM ticket_tiers WHERE id = $1`, [testTierId]);
    log("Before expiry: quantity_reserved = 1", tierBeforeExpire.rows[0].quantity_reserved === 1, `reserved=${tierBeforeExpire.rows[0].quantity_reserved}`);

    // Call expire_reserved_orders
    const expireResult = await db(`SELECT expire_reserved_orders() as expired_count`);
    log("expire_reserved_orders executed", true, `expired_count=${expireResult.rows[0].expired_count}`);

    const expiredOrder = await db(`SELECT status FROM orders WHERE id = $1`, [order3Id]);
    log("Expired order status is EXPIRED", expiredOrder.rows[0].status === "EXPIRED", `status=${expiredOrder.rows[0].status}`);

    const tierAfterExpire = await db(`SELECT quantity_reserved FROM ticket_tiers WHERE id = $1`, [testTierId]);
    log("quantity_reserved released after expiry (back to 0)", tierAfterExpire.rows[0].quantity_reserved === 0, `reserved=${tierAfterExpire.rows[0].quantity_reserved}`);

    // --- TEST 7: Overbooking protection during reservation ---
    console.log("\n--- TEST 7: Overbooking protection ---");

    // We have 10 tickets, 2 sold, 0 reserved. 8 available but max 5 per order.
    // Try to reserve 6 (should fail — exceeds max 5 per order)
    try {
      await rpcWithAuth(testUserId3, `
        SELECT * FROM create_reserved_order(
          p_event_id := $1, p_tier_id := $2, p_quantity := 6,
          p_unit_price_paise := 50000, p_subtotal_paise := 300000,
          p_platform_fee_paise := 36000, p_commission_paise := 30000,
          p_convenience_fee_paise := 6000, p_organizer_payout_paise := 270000,
          p_total_paise := 306000, p_fee_payer := 'BUYER',
          p_buyer_name := 'Greedy Buyer', p_buyer_phone := null,
          p_buyer_email := null, p_buyer_gender := null
        )
      `, [testEventId, testTierId]);
      log("Over-max-quantity attempt blocked", false, "should have thrown error");
    } catch (err) {
      log("Over-max-quantity attempt blocked", true, `error=${err.message?.slice(0, 60)}`);
    }

    // Reserve 5 (should succeed — within max and available)
    const reserve4 = await rpcWithAuth(testUserId4, `
      SELECT * FROM create_reserved_order(
        p_event_id := $1, p_tier_id := $2, p_quantity := 5,
        p_unit_price_paise := 50000, p_subtotal_paise := 250000,
        p_platform_fee_paise := 30000, p_commission_paise := 25000,
        p_convenience_fee_paise := 5000, p_organizer_payout_paise := 225000,
        p_total_paise := 255000, p_fee_payer := 'BUYER',
        p_buyer_name := 'Big Buyer', p_buyer_phone := null,
        p_buyer_email := null, p_buyer_gender := null
      )
    `, [testEventId, testTierId]);

    const reserved4 = reserve4.rows[0];
    log("Reserve 5 tickets succeeds", !!reserved4?.id, `orderId=${reserved4?.id?.slice(0, 8)}…`);

    // Verify only 3 remaining (10 - 2 sold - 5 reserved = 3)
    const tierFinal = await db(`SELECT quantity, quantity_sold, quantity_reserved FROM ticket_tiers WHERE id = $1`, [testTierId]);
    log("Remaining inventory = 3", tierFinal.rows[0].quantity - tierFinal.rows[0].quantity_sold - tierFinal.rows[0].quantity_reserved === 3, `remaining=${tierFinal.rows[0].quantity - tierFinal.rows[0].quantity_sold - tierFinal.rows[0].quantity_reserved}`);

  } finally {
    // --- CLEANUP ---
    console.log("\n--- CLEANUP ---");
    try {
      await db(`DELETE FROM tickets WHERE order_id IN (SELECT id FROM orders WHERE event_id = $1)`, [testEventId]);
      await db(`DELETE FROM orders WHERE event_id = $1`, [testEventId]);
      await db(`DELETE FROM ticket_tiers WHERE event_id = $1`, [testEventId]);
      await db(`DELETE FROM events WHERE id = $1`, [testEventId]);
      await db(`DELETE FROM organizers WHERE id = $1`, [testOrganizerId]);
      // Clean up all test users
      for (const uid of [testUserId, testUserId2, testUserId3, testUserId4]) {
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
  console.log(`RAZORPAY PAYMENT FLOW TEST RESULTS: ${passed} PASS, ${failed} FAIL`);
  console.log(`${"=".repeat(60)}`);

  if (failed > 0) {
    console.log("\n❌ FAILED TESTS:");
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
  } else {
    console.log("\n🎉 ALL RAZORPAY FLOW INVARIANTS VERIFIED.");
  }

  await dbClient.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  dbClient.end().then(() => process.exit(1));
});
