/**
 * Critical Flow Test — Paid Event End-to-End
 *
 * Tests the full critical path:
 * 1. Organizer creates a PAID event
 * 2. Organizer publishes it
 * 3. User discovers and books a ticket
 * 4. Admin approves the order
 * 5. Ticket generated with QR
 * 6. Inventory decremented
 * 7. Fee snapshot verified
 * 8. Door scanner check-in
 * 9. Duplicate scan rejected
 * 10. Admin cancels event
 * 11. Admin deletes event
 *
 * Uses three separate browser contexts for organizer, user, and admin.
 */

import { chromium } from "playwright";
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();

const BASE = "http://localhost:3000";
const ORG_EMAIL = "org1@gmail.com";
const ORG_PASSWORD = "123456";
const USER_EMAIL = "user1@gmail.com";
const USER_PASSWORD = "123456";
const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD = "123456";
const DUMMY_UTR = "428193756201";

const dbClient = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

const results = [];
function log(name, pass, detail = "") {
  const status = pass ? "✅ PASS" : "❌ FAIL";
  results.push({ name, pass, detail });
  console.log(`${status} | ${name}${detail ? " | " + detail : ""}`);
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

async function db(query, params = []) {
  return dbClient.query(query, params);
}

/** Login and return whether auth cookie was set */
async function login(page, context, email, password) {
  await goto(page, `${BASE}/login`);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button:has-text("Sign in")').last().click();
  await page.waitForTimeout(8000);
  const cookies = await context.cookies();
  return cookies.some(c => c.name.includes("auth-token"));
}

/** Logout by clearing cookies */
async function logout(context) {
  await context.clearCookies();
}

async function main() {
  await dbClient.connect();
  console.log("Connected to DB");

  const browser = await chromium.launch({ headless: true });

  try {
    // ================================================================
    // STEP 1: Organizer Creates Event
    // ================================================================
    console.log("\n=== STEP 1: Organizer Creates PAID Event ===");
    const orgContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const orgPage = await orgContext.newPage();

    const orgErrors = [];
    orgPage.on("console", (msg) => { if (msg.type() === "error") orgErrors.push(msg.text()); });
    orgPage.on("pageerror", (err) => orgErrors.push(`PAGE ERROR: ${err.message}`));

    const orgLoggedIn = await login(orgPage, orgContext, ORG_EMAIL, ORG_PASSWORD);
    log("Organizer login", orgLoggedIn, orgLoggedIn ? "Auth cookie set" : "Failed");
    if (!orgLoggedIn) { console.log("FATAL: Could not log in as organizer"); await browser.close(); await dbClient.end(); return; }

    // Get organizer user ID
    const { rows: orgRows } = await db("SELECT id FROM auth.users WHERE email = $1", [ORG_EMAIL]);
    const orgUserId = orgRows[0].id;

    // Go to organizer create tab
    await goto(orgPage, `${BASE}/organizer?tab=create`);

    // Fill the event form
    await orgPage.locator('input[name="title"]').first().fill("QA Critical Flow — Paid Event");

    // Category — click "Cypher & Battle" chip
    const categoryChip = orgPage.locator('label:has-text("Cypher & Battle")').first();
    if (await categoryChip.isVisible().catch(() => false)) {
      await categoryChip.click();
      await orgPage.waitForTimeout(500);
    }

    // City
    await orgPage.locator('select[name="city"]').first().selectOption("KOLKATA");

    // Starts at — 30 days from now in IST (datetime-local format)
    // Use IST: current time + 5.5 hours offset to get UTC, then slice
    const now = new Date();
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    // Format as IST datetime-local: use Intl to get IST components
    const istFmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const istParts = Object.fromEntries(istFmt.formatToParts(futureDate).map(p => [p.type, p.value]));
    const futureDateStr = `${istParts.year}-${istParts.month}-${istParts.day}T${istParts.hour}:${istParts.minute}`;
    await orgPage.locator('input[name="startsAt"]').first().fill(futureDateStr);

    // Ends at — 2 hours after start
    const endDate = new Date(futureDate.getTime() + 2 * 60 * 60 * 1000);
    const istPartsEnd = Object.fromEntries(istFmt.formatToParts(endDate).map(p => [p.type, p.value]));
    const endDateStr = `${istPartsEnd.year}-${istPartsEnd.month}-${istPartsEnd.day}T${istPartsEnd.hour}:${istPartsEnd.minute}`;
    const endsAtInput = orgPage.locator('input[name="endsAt"]').first();
    if (await endsAtInput.isVisible().catch(() => false)) {
      await endsAtInput.fill(endDateStr);
    }

    // Venue
    await orgPage.locator('input[name="venueName"]').first().fill("QA Test Venue");
    await orgPage.locator('textarea[name="venueAddress"]').first().fill("123 Test Street, Kolkata");
    await orgPage.locator('input[name="googleMapsLink"]').first().fill("https://maps.google.com/?q=Kolkata");

    // Description
    await orgPage.locator('textarea[name="description"]').first().fill("QA critical flow test event.");
    await orgPage.locator('textarea[name="thingsToKnow"]').first().fill("Bring water\nNo alcohol");
    await orgPage.locator('textarea[name="terms"]').first().fill("No refunds\nEntry on valid ticket only");

    // Pricing mode — FLAT
    const flatBtn = orgPage.locator('button:has-text("Flat")').first();
    if (await flatBtn.isVisible().catch(() => false)) {
      await flatBtn.click();
      await orgPage.waitForTimeout(1000);
    }

    // Tier price and quantity
    await orgPage.locator('input[name="tierPrice"]').first().fill("300");
    await orgPage.locator('input[name="tierQuantity"]').first().fill("50");

    // Organizer terms checkbox
    const termsCheckbox = orgPage.locator('input[name="organizerTerms"]').first();
    if (await termsCheckbox.isVisible().catch(() => false)) {
      if (!(await termsCheckbox.isChecked())) await termsCheckbox.check();
    }

    // Submit — Publish
    const publishBtn = orgPage.locator('button:has-text("Publish event")').first();
    const publishVisible = await publishBtn.isVisible().catch(() => false);
    log("Event create → form filled", publishVisible, publishVisible ? "Form ready" : "Form not visible");

    let newEventId = null;
    if (publishVisible) {
      await publishBtn.click();
      await orgPage.waitForURL("**/organizer/events/**", { timeout: 60000 }).catch(() => {});
      await orgPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await orgPage.waitForTimeout(3000);

      // Verify in DB
      const { rows: newEvents } = await db(
        "SELECT id, title, status, pricing_mode, city, starts_at, ends_at FROM public.events WHERE title = 'QA Critical Flow — Paid Event' ORDER BY created_at DESC LIMIT 1"
      );
      if (newEvents.length > 0) {
        newEventId = newEvents[0].id;
        log("Event create → event in DB", true, `id=${newEventId} status=${newEvents[0].status}`);
        log("Event create → status is PUBLISHED", newEvents[0].status === "PUBLISHED", `status=${newEvents[0].status}`);
        log("Event create → pricing_mode is FLAT", newEvents[0].pricing_mode === "FLAT", `mode=${newEvents[0].pricing_mode}`);

        // Verify timezone — starts_at should be the IST time converted to UTC
        // The organizer selected futureDateStr in IST, so starts_at should be futureDateStr - 5:30 = UTC
        const expectedUTC = new Date(futureDateStr + "+05:30").toISOString();
        const actualUTC = new Date(newEvents[0].starts_at).toISOString();
        const tzDiffMs = Math.abs(new Date(expectedUTC).getTime() - new Date(actualUTC).getTime());
        const tzCorrect = tzDiffMs < 1000; // within 1 second
        log("Event create → starts_at timezone correct (IST→UTC)", tzCorrect, `expected=${expectedUTC} actual=${actualUTC} diff=${tzDiffMs}ms`);

        // Check tier
        const { rows: newTiers } = await db("SELECT name, price_paise, quantity FROM public.ticket_tiers WHERE event_id = $1", [newEventId]);
        log("Event create → tier created", newTiers.length > 0, `${newTiers.length} tiers, price=${newTiers[0]?.price_paise}, qty=${newTiers[0]?.quantity}`);
        log("Event create → tier price is 30000 paise", newTiers.length > 0 && newTiers[0].price_paise === 30000, `price=${newTiers[0]?.price_paise}`);
        log("Event create → tier quantity is 50", newTiers.length > 0 && newTiers[0].quantity === 50, `qty=${newTiers[0]?.quantity}`);
      } else {
        log("Event create → event in DB", false, "No event found");
      }
    }

    if (!newEventId) {
      console.log("FATAL: Event not created, aborting");
      await browser.close(); await dbClient.end(); return;
    }

    // ================================================================
    // STEP 2: User Discovers and Books Ticket
    // ================================================================
    console.log("\n=== STEP 2: User Discovers and Books ===");
    const userContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const userPage = await userContext.newPage();

    const userErrors = [];
    userPage.on("console", (msg) => { if (msg.type() === "error") userErrors.push(msg.text()); });
    userPage.on("pageerror", (err) => userErrors.push(`PAGE ERROR: ${err.message}`));

    const userLoggedIn = await login(userPage, userContext, USER_EMAIL, USER_PASSWORD);
    log("User login", userLoggedIn, userLoggedIn ? "Auth cookie set" : "Failed");
    if (!userLoggedIn) { console.log("FATAL: Could not log in as user"); await browser.close(); await dbClient.end(); return; }

    const { rows: userRows } = await db("SELECT id FROM auth.users WHERE email = $1", [USER_EMAIL]);
    const userId = userRows[0].id;

    // Go to event page
    await goto(userPage, `${BASE}/events/${newEventId}`);
    await userPage.waitForTimeout(3000);

    // Click "Book now"
    const bookBtn = userPage.locator('button:has-text("Book now")').first();
    const bookVisible = await bookBtn.isVisible().catch(() => false);
    if (bookVisible) {
      await bookBtn.click();
      await userPage.waitForTimeout(5000);
      await userPage.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
      await userPage.waitForTimeout(3000);

      // Wait for checkout form
      await userPage.waitForSelector('input[name="utrReference"]', { timeout: 30000 }).catch(() => {});
      await userPage.waitForTimeout(2000);

      const utrInput = userPage.locator('input[name="utrReference"]').first();
      const utrVisible = await utrInput.isVisible().catch(() => false);
      if (utrVisible) {
        await utrInput.fill(DUMMY_UTR);
        const nameInput = userPage.locator('input[name="buyerName"]').first();
        if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("QA Tester");

        const phoneTel = userPage.locator('input[type="tel"]').first();
        if (await phoneTel.isVisible().catch(() => false)) await phoneTel.fill("9876543210");

        const emailInput = userPage.locator('input[name="buyerEmail"]').first();
        if (await emailInput.isVisible().catch(() => false)) await emailInput.fill("qa@test.com");

        const genderSelect = userPage.locator('select[name="buyerGender"]').first();
        if (await genderSelect.isVisible().catch(() => false)) {
          await genderSelect.selectOption("other").catch(() => {});
        }

        await userPage.locator('button:has-text("I\'ve paid")').first().click();
        await userPage.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
        await userPage.waitForTimeout(8000);

        // Verify pending order in DB
        const { rows: bookOrders } = await db(
          "SELECT id, status, commission_paise, convenience_fee_paise, organizer_payout_paise FROM public.orders WHERE user_id = $1 AND event_id = $2 ORDER BY created_at DESC LIMIT 1",
          [userId, newEventId]
        );
        log("Book → order created", bookOrders.length > 0, `status=${bookOrders[0]?.status}`);
        log("Book → status is PENDING_VERIFICATION", bookOrders.length > 0 && bookOrders[0].status === "PENDING_VERIFICATION", `status=${bookOrders[0]?.status}`);

        // Verify fee snapshot (values in paise: 10% of ₹300 = 3000 paise, 2% of ₹300 = 600 paise)
        if (bookOrders.length > 0) {
          const commission = bookOrders[0].commission_paise;
          const convenience = bookOrders[0].convenience_fee_paise;
          const payout = bookOrders[0].organizer_payout_paise;
          log("Book → commission_paise = 3000 (10% of ₹300)", commission === 3000, `commission=${commission}`);
          log("Book → convenience_fee_paise = 600 (2% of ₹300)", convenience === 600, `convenience=${convenience}`);
          log("Book → organizer_payout_paise = 27000 (₹300 - ₹30)", payout === 27000, `payout=${payout}`);
        }

        const pendingOrderId = bookOrders[0]?.id;

        // ================================================================
        // STEP 3: Admin Approves the Order
        // ================================================================
        console.log("\n=== STEP 3: Admin Approves Order ===");
        const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const adminPage = await adminContext.newPage();

        const adminErrors = [];
        adminPage.on("console", (msg) => { if (msg.type() === "error") adminErrors.push(msg.text()); });
        adminPage.on("pageerror", (err) => adminErrors.push(`PAGE ERROR: ${err.message}`));

        const adminLoggedIn = await login(adminPage, adminContext, ADMIN_EMAIL, ADMIN_PASSWORD);
        log("Admin login", adminLoggedIn, adminLoggedIn ? "Auth cookie set" : "Failed");
        if (!adminLoggedIn) { console.log("FATAL: Could not log in as admin"); await browser.close(); await dbClient.end(); return; }

        // Go to admin orders page
        await goto(adminPage, `${BASE}/admin/orders`);
        await adminPage.waitForTimeout(3000);

        // Find the Approve button for this order
        const approveForm = adminPage.locator('form').filter({ hasText: "Approve" }).first();
        if (await approveForm.isVisible().catch(() => false)) {
          await approveForm.locator('button').first().click();
          await adminPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
          await adminPage.waitForTimeout(5000);

          // Verify in DB
          const { rows: approvedOrder } = await db("SELECT status FROM public.orders WHERE id = $1", [pendingOrderId]);
          log("Admin approve → order CONFIRMED", approvedOrder[0]?.status === "CONFIRMED", `status=${approvedOrder[0]?.status}`);

          // Check ticket generated
          const { rows: approvedTickets } = await db("SELECT id, qr_hash, status FROM public.tickets WHERE order_id = $1", [pendingOrderId]);
          log("Admin approve → ticket generated with QR", approvedTickets.length > 0 && !!approvedTickets[0].qr_hash, `${approvedTickets.length} tickets`);
          log("Admin approve → ticket status VALID", approvedTickets.length > 0 && approvedTickets[0].status === "VALID", `status=${approvedTickets[0]?.status}`);

          // Check tier quantity_sold incremented
          const { rows: tierAfter } = await db("SELECT quantity_sold FROM public.ticket_tiers WHERE event_id = $1", [newEventId]);
          log("Admin approve → tier quantity_sold incremented", tierAfter[0]?.quantity_sold === 1, `sold=${tierAfter[0]?.quantity_sold}`);

          // ================================================================
          // STEP 4: Door Scanner Check-In
          // ================================================================
          console.log("\n=== STEP 4: Door Scanner Check-In ===");
          const qrHash = approvedTickets[0]?.qr_hash;
          if (qrHash) {
            // Use organizer page for scanning
            await goto(orgPage, `${BASE}/organizer/events/${newEventId}/scan`);
            await orgPage.waitForSelector('input[placeholder="Enter ticket hash manually"]', { timeout: 30000 }).catch(() => {});
            await orgPage.waitForTimeout(2000);

            const manualHashInput = orgPage.locator('input[placeholder="Enter ticket hash manually"]').first();
            if (await manualHashInput.isVisible().catch(() => false)) {
              await manualHashInput.fill(qrHash);
              await orgPage.locator('button:has-text("Check in")').first().click();
              // Wait for the server action to complete and DB to update
              await orgPage.waitForTimeout(8000);

              // Check page for VALID result
              const pageText1 = await orgPage.innerText("body").catch(() => "");
              const hasValid = pageText1.includes("VALID") || pageText1.includes("Checked In") || pageText1.includes("checked in");
              console.log("  Scan result page contains VALID:", hasValid);

              const { rows: checkedInTicket } = await db("SELECT status FROM public.tickets WHERE qr_hash = $1", [qrHash]);
              log("Door scan → ticket status is USED", checkedInTicket[0]?.status === "USED", `status=${checkedInTicket[0]?.status}`);

              // Duplicate scan — wait for cooldown, then clear and re-enter
              await orgPage.waitForTimeout(4000); // wait for 3s cooldown
              await manualHashInput.fill("");
              await manualHashInput.fill(qrHash);
              await orgPage.locator('button:has-text("Check in")').first().click();
              await orgPage.waitForTimeout(8000);

              const pageText = await orgPage.innerText("body").catch(() => "");
              const hasAlreadyUsed = pageText.includes("ALREADY USED") || pageText.includes("already used") || pageText.includes("Already used");
              log("Door scan → duplicate scan shows ALREADY USED", hasAlreadyUsed, hasAlreadyUsed ? "Found" : "Not found");
            } else {
              log("Door scan → manual hash input not found", false, "");
            }
          } else {
            log("Door scan → no QR hash available", false, "");
          }

          // ================================================================
          // STEP 5: Front Row Boost
          // ================================================================
          console.log("\n=== STEP 5: Front Row Boost ===");
          await goto(orgPage, `${BASE}/organizer/events/${newEventId}`);
          await orgPage.waitForTimeout(3000);

          const featureBtn = orgPage.locator('button:has-text("Feature My Event")').first();
          const featureVisible = await featureBtn.isVisible().catch(() => false);
          if (featureVisible) {
            await featureBtn.click();
            await orgPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
            await orgPage.waitForTimeout(5000);

            await goto(orgPage, `${BASE}/organizer/events/${newEventId}`);
            await orgPage.waitForTimeout(3000);

            const utrInputBoost = orgPage.locator('input[name="utr"]').first();
            if (await utrInputBoost.isVisible().catch(() => false)) {
              await utrInputBoost.fill(DUMMY_UTR);
              await orgPage.locator('button:has-text("Submit UTR")').first().click();
              await orgPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
              await orgPage.waitForTimeout(5000);
            }

            const { rows: pendingBoosts } = await db("SELECT id, status FROM public.hero_boosts WHERE event_id = $1 AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1", [newEventId]);
            if (pendingBoosts.length > 0) {
              const pendingBoostId = pendingBoosts[0].id;
              log("Front Row → pending boost created", true, `id=${pendingBoostId}`);

              await goto(adminPage, `${BASE}/admin/boosts`);
              await adminPage.waitForTimeout(3000);

              const activateBtn = adminPage.locator('button:has-text("Verify & Activate")').first();
              const activateVisible = await activateBtn.isVisible().catch(() => false);
              if (activateVisible) {
                await activateBtn.click();
                await adminPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
                await adminPage.waitForTimeout(5000);

                const { rows: activatedBoost } = await db("SELECT status FROM public.hero_boosts WHERE id = $1", [pendingBoostId]);
                log("Admin approve boost → status is ACTIVE", activatedBoost[0]?.status === "ACTIVE", `status=${activatedBoost[0]?.status}`);
              } else {
                log("Admin approve boost → Activate button not found", false, "");
              }
            } else {
              log("Front Row → pending boost not created", false, "");
            }
          } else {
            log("Front Row → Feature button not found", false, "Boost may already exist");
          }

          // ================================================================
          // STEP 6: Admin Cancels Event
          // ================================================================
          console.log("\n=== STEP 6: Admin Cancels Event ===");
          await goto(adminPage, `${BASE}/admin/events`);
          await adminPage.waitForTimeout(3000);

          const eventLink = adminPage.locator(`a[href="/events/${newEventId}"]`).first();
          const eventCard = eventLink.locator('xpath=ancestor::div[contains(@class,"glass")][1]');
          const cancelBtn = eventCard.locator('button:has-text("Cancel")').first();
          const cancelVisible = await cancelBtn.isVisible().catch(() => false);
          if (cancelVisible) {
            await cancelBtn.click();
            await adminPage.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
            await adminPage.waitForTimeout(8000);

            const { rows: cancelledEvent } = await db("SELECT status FROM public.events WHERE id = $1", [newEventId]);
            log("Admin cancel event → status is CANCELLED", cancelledEvent[0]?.status === "CANCELLED", `status=${cancelledEvent[0]?.status}`);
          } else {
            log("Admin cancel event → Cancel button not found", false, "");
          }

          // ================================================================
          // STEP 7: Admin Deletes Event
          // ================================================================
          console.log("\n=== STEP 7: Admin Deletes Event ===");
          await goto(adminPage, `${BASE}/admin/events`);
          await adminPage.waitForTimeout(3000);

          const deleteLink = adminPage.locator(`a[href="/events/${newEventId}"]`).first();
          const deleteCard = deleteLink.locator('xpath=ancestor::div[contains(@class,"glass")][1]');
          const deleteBtn = deleteCard.locator('button:has-text("Delete")').first();
          const deleteVisible = await deleteBtn.isVisible().catch(() => false);
          if (deleteVisible) {
            await deleteBtn.click();
            await adminPage.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
            await adminPage.waitForTimeout(8000);

            const { rows: deletedEvent } = await db("SELECT id FROM public.events WHERE id = $1", [newEventId]);
            log("Admin delete event → event removed from DB", deletedEvent.length === 0, `rows=${deletedEvent.length}`);
          } else {
            log("Admin delete event → Delete button not found", false, "");
          }

          await adminContext.close();
        } else {
          log("Admin approve → Approve form not found", false, "");
        }
      } else {
        log("Book → UTR input not found", false, "");
      }
    } else {
      log("Book → Book now button not found", false, "");
    }

    // ================================================================
    // CONSOLE ERRORS CHECK
    // ================================================================
    console.log("\n=== Console Errors Check ===");
    const allErrors = [...orgErrors, ...userErrors];
    const realErrors = allErrors.filter(e =>
      !e.includes("favicon") && !e.includes("manifest") && !e.includes("webpack") &&
      !e.includes("Fast Refresh") && !e.includes("Cross origin") && !e.includes("404")
    );
    log("No console errors during all flows", realErrors.length === 0, realErrors.length > 0 ? `${realErrors.length} errors: ${realErrors.slice(0, 3).join("; ")}` : "");

    // ================================================================
    // SUMMARY
    // ================================================================
    const passCount = results.filter(r => r.pass).length;
    const failCount = results.filter(r => !r.pass).length;
    console.log(`\n${"=".repeat(60)}`);
    console.log(`CRITICAL FLOW TEST RESULTS: ${passCount} PASS, ${failCount} FAIL`);
    console.log(`${"=".repeat(60)}`);

    if (failCount > 0) {
      console.log("\nFailed tests:");
      results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.name}${r.detail ? " — " + r.detail : ""}`));
    }

    await orgContext.close();
    await userContext.close();

  } catch (err) {
    console.error("FATAL ERROR:", err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
    await dbClient.end();
  }
}

main().catch(console.error);
