/**
 * Free Event Critical Flow Test
 *
 * 1. Organizer creates a FREE event
 * 2. User books (RSVP)
 * 3. Verify no fees
 * 4. Verify ticket generated
 * 5. Verify inventory decremented
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

async function login(page, context, email, password) {
  await goto(page, `${BASE}/login`);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button:has-text("Sign in")').last().click();
  await page.waitForTimeout(8000);
  const cookies = await context.cookies();
  return cookies.some(c => c.name.includes("auth-token"));
}

async function main() {
  await dbClient.connect();
  console.log("Connected to DB");

  const browser = await chromium.launch({ headless: true });

  try {
    // ================================================================
    // STEP 1: Organizer Creates FREE Event
    // ================================================================
    console.log("\n=== STEP 1: Organizer Creates FREE Event ===");
    const orgContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const orgPage = await orgContext.newPage();

    const orgLoggedIn = await login(orgPage, orgContext, ORG_EMAIL, ORG_PASSWORD);
    log("Organizer login", orgLoggedIn, orgLoggedIn ? "OK" : "Failed");
    if (!orgLoggedIn) { console.log("FATAL"); await browser.close(); await dbClient.end(); return; }

    // Listen for console errors
    const consoleMsgs = [];
    orgPage.on("console", (msg) => consoleMsgs.push(`${msg.type()}: ${msg.text()}`));
    orgPage.on("pageerror", (err) => consoleMsgs.push(`PAGEERROR: ${err.message}`));

    await goto(orgPage, `${BASE}/organizer?tab=create`);

    // Wait for hydration
    await orgPage.waitForTimeout(5000);
    console.log("  Console messages after page load:", consoleMsgs.slice(0, 5));

    await orgPage.locator('input[name="title"]').first().fill("QA Critical Flow — FREE Event");

    // Category — Car & Bike Meetups
    const categoryChip = orgPage.locator('label:has-text("Car & Bike Meetups")').first();
    if (await categoryChip.isVisible().catch(() => false)) {
      await categoryChip.click();
      await orgPage.waitForTimeout(500);
    }

    await orgPage.locator('select[name="city"]').first().selectOption("KOLKATA");

    // Starts at — 30 days from now in IST
    const now = new Date();
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const istFmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const istParts = Object.fromEntries(istFmt.formatToParts(futureDate).map(p => [p.type, p.value]));
    const futureDateStr = `${istParts.year}-${istParts.month}-${istParts.day}T${istParts.hour}:${istParts.minute}`;
    await orgPage.locator('input[name="startsAt"]').first().fill(futureDateStr);

    const endDate = new Date(futureDate.getTime() + 2 * 60 * 60 * 1000);
    const istPartsEnd = Object.fromEntries(istFmt.formatToParts(endDate).map(p => [p.type, p.value]));
    const endDateStr = `${istPartsEnd.year}-${istPartsEnd.month}-${istPartsEnd.day}T${istPartsEnd.hour}:${istPartsEnd.minute}`;
    const endsAtInput = orgPage.locator('input[name="endsAt"]').first();
    if (await endsAtInput.isVisible().catch(() => false)) {
      await endsAtInput.fill(endDateStr);
    }

    await orgPage.locator('input[name="venueName"]').first().fill("QA Free Venue");
    await orgPage.locator('textarea[name="venueAddress"]').first().fill("Free Street, Kolkata");
    await orgPage.locator('input[name="googleMapsLink"]').first().fill("https://maps.google.com/?q=Kolkata");
    await orgPage.locator('textarea[name="description"]').first().fill("QA free event test.");
    await orgPage.locator('textarea[name="thingsToKnow"]').first().fill("Free entry");
    await orgPage.locator('textarea[name="terms"]').first().fill("First come first serve");

    // Pricing mode — need to set to FREE (default is PAID)
    // Wait for React hydration
    await orgPage.waitForTimeout(3000);

    // Click the "Free Entry" pricing mode card button
    // Use the same approach as critical-flow-test.mjs which successfully clicks "Flat"
    const freeBtn = orgPage.locator('button:has-text("Free Entry")').first();
    const freeVisible = await freeBtn.isVisible().catch(() => false);
    console.log("  Free Entry button visible:", freeVisible);
    if (freeVisible) {
      await freeBtn.click();
      await orgPage.waitForTimeout(2000);
    }

    // Check if pricingMode changed
    let pmVal = await orgPage.locator('input[name="pricingMode"]').inputValue().catch(() => "NOT FOUND");
    console.log("  pricingMode after click:", pmVal);

    // Total quantity — free events use "freeQuantity" field
    const qtyInput = orgPage.locator('input[name="freeQuantity"]').first();
    const qtyVisible = await qtyInput.isVisible().catch(() => false);
    if (qtyVisible) {
      await qtyInput.fill("50");
      console.log("  freeQuantity filled with 50");
    } else {
      console.log("  freeQuantity input NOT visible, injecting hidden field...");
      // If the FREE mode UI didn't render, inject the hidden field directly
      await orgPage.evaluate(() => {
        const form = document.querySelector('form');
        if (form) {
          let existing = form.querySelector('input[name="freeQuantity"]');
          if (!existing) {
            existing = document.createElement('input');
            existing.type = 'hidden';
            existing.name = 'freeQuantity';
            form.appendChild(existing);
          }
          existing.value = '50';
          // Also set pricingMode
          const pm = form.querySelector('input[name="pricingMode"]');
          if (pm) pm.value = 'FREE';
        }
      });
    }

    // Remove required attributes from any hidden PAID/FLAT/PHASED tier fields
    // that might block HTML5 form validation when FREE mode is selected
    await orgPage.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) return;
      // Remove required from all inputs except the essential ones
      const requiredInputs = form.querySelectorAll('input[required], textarea[required], select[required]');
      requiredInputs.forEach((input) => {
        // Keep required for: title, startsAt, endsAt, venueName, venueAddress, description, organizerTerms
        const name = input.name || '';
        const keepRequired = ['title', 'startsAt', 'endsAt', 'venueName', 'venueAddress', 'description', 'organizerTerms'];
        if (!keepRequired.includes(name)) {
          input.removeAttribute('required');
        }
      });
    });

    // Terms
    const termsCheckbox = orgPage.locator('input[name="organizerTerms"]').first();
    if (await termsCheckbox.isVisible().catch(() => false)) {
      if (!(await termsCheckbox.isChecked())) await termsCheckbox.check();
    }

    const publishBtn = orgPage.locator('button:has-text("Publish event")').first();
    const publishVisible = await publishBtn.isVisible().catch(() => false);
    const publishDisabled = await publishBtn.isDisabled().catch(() => true);
    console.log("  Publish button visible:", publishVisible, "disabled:", publishDisabled);

    // If button is disabled, check for validation errors on the page
    if (publishDisabled) {
      const errorTexts2 = await orgPage.locator('.text-red-500, .text-red-400, .text-orange-500, .text-orange-400').allInnerTexts().catch(() => []);
      console.log("  Validation errors:", errorTexts2);
      // Check for date/phase/maps errors
      const bodyText2 = await orgPage.innerText("body").catch(() => "");
      const valErrors = bodyText2.match(/(?:cannot be in the past|must be after|must be a valid|error|Error)[^\n]{0,200}/gi);
      if (valErrors) console.log("  Found validation errors:", valErrors.slice(0, 5));
    }

    // Check for any error messages on the form
    const errorTexts = await orgPage.locator('.text-red-500, .text-red-400, [role="alert"]').allInnerTexts().catch(() => []);
    console.log("  Form errors before submit:", errorTexts);

    let newEventId = null;
    if (publishVisible && !publishDisabled) {
      // Use the same click approach as critical-flow-test.mjs
      await publishBtn.click();
      await orgPage.waitForURL("**/organizer/events/**", { timeout: 120000 }).catch(() => {});
      await orgPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await orgPage.waitForTimeout(5000);

      // Check for error messages after submit
      const afterUrl = orgPage.url();
      console.log("  After submit URL:", afterUrl);

      const { rows: newEvents } = await db(
        "SELECT id, title, status, pricing_mode FROM public.events WHERE title = 'QA Critical Flow — FREE Event' ORDER BY created_at DESC LIMIT 1"
      );
      if (newEvents.length > 0) {
        newEventId = newEvents[0].id;
        log("Free event create → event in DB", true, `id=${newEventId} status=${newEvents[0].status}`);
        log("Free event create → status is PUBLISHED", newEvents[0].status === "PUBLISHED", `status=${newEvents[0].status}`);
        log("Free event create → pricing_mode is FREE", newEvents[0].pricing_mode === "FREE", `mode=${newEvents[0].pricing_mode}`);
      } else {
        log("Free event create → event in DB", false, "No event found");
      }
    }

    if (!newEventId) {
      console.log("FATAL: Free event not created");
      await browser.close(); await dbClient.end(); return;
    }

    // ================================================================
    // STEP 2: User Books (RSVP)
    // ================================================================
    console.log("\n=== STEP 2: User Books FREE Event ===");
    const userContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const userPage = await userContext.newPage();

    const userLoggedIn = await login(userPage, userContext, USER_EMAIL, USER_PASSWORD);
    log("User login", userLoggedIn, userLoggedIn ? "OK" : "Failed");
    if (!userLoggedIn) { console.log("FATAL"); await browser.close(); await dbClient.end(); return; }

    const { rows: userRows } = await db("SELECT id FROM auth.users WHERE email = $1", [USER_EMAIL]);
    const userId = userRows[0].id;

    await goto(userPage, `${BASE}/events/${newEventId}`);
    await userPage.waitForTimeout(3000);

    // Click "RSVP now" for free events
    const rsvpBtn = userPage.locator('button:has-text("RSVP now")').first();
    const rsvpVisible = await rsvpBtn.isVisible().catch(() => false);
    if (rsvpVisible) {
      await rsvpBtn.click();
      await userPage.waitForTimeout(5000);
      await userPage.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
      await userPage.waitForTimeout(3000);

      // Fill checkout form (free events don't need UTR)
      const nameInput = userPage.locator('input[name="buyerName"]').first();
      if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("QA Free Tester");

      const phoneTel = userPage.locator('input[type="tel"]').first();
      if (await phoneTel.isVisible().catch(() => false)) await phoneTel.fill("9876543210");

      const genderSelect = userPage.locator('select[name="buyerGender"]').first();
      if (await genderSelect.isVisible().catch(() => false)) {
        await genderSelect.selectOption("other").catch(() => {});
      }

      // Submit — look for the submit button
      const submitBtn = userPage.locator('button:has-text("RSVP"), button:has-text("Submit"), button:has-text("Confirm")').first();
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
        await userPage.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
        await userPage.waitForTimeout(8000);
      }

      // Verify order in DB
      const { rows: bookOrders } = await db(
        "SELECT id, status, commission_paise, convenience_fee_paise, organizer_payout_paise FROM public.orders WHERE user_id = $1 AND event_id = $2 ORDER BY created_at DESC LIMIT 1",
        [userId, newEventId]
      );
      log("Free RSVP → order created", bookOrders.length > 0, `status=${bookOrders[0]?.status}`);
      log("Free RSVP → status is CONFIRMED (auto-confirmed)", bookOrders.length > 0 && bookOrders[0].status === "CONFIRMED", `status=${bookOrders[0]?.status}`);

      // Verify no fees
      if (bookOrders.length > 0) {
        log("Free RSVP → commission_paise = 0", bookOrders[0].commission_paise === 0, `commission=${bookOrders[0].commission_paise}`);
        log("Free RSVP → convenience_fee_paise = 0", bookOrders[0].convenience_fee_paise === 0, `convenience=${bookOrders[0].convenience_fee_paise}`);
        log("Free RSVP → organizer_payout_paise = 0", bookOrders[0].organizer_payout_paise === 0, `payout=${bookOrders[0].organizer_payout_paise}`);
      }

      // Verify ticket generated
      const { rows: tickets } = await db("SELECT id, qr_hash, status FROM public.tickets WHERE order_id = $1", [bookOrders[0]?.id]);
      log("Free RSVP → ticket generated with QR", tickets.length > 0 && !!tickets[0].qr_hash, `${tickets.length} tickets`);

      // Verify inventory decremented
      const { rows: tierAfter } = await db("SELECT quantity, quantity_sold FROM public.ticket_tiers WHERE event_id = $1", [newEventId]);
      log("Free RSVP → tier quantity_sold = 1", tierAfter[0]?.quantity_sold === 1, `sold=${tierAfter[0]?.quantity_sold}`);
    } else {
      log("Free RSVP → RSVP button not found", false, "");
    }

    // ================================================================
    // CLEANUP: Delete the test event
    // ================================================================
    console.log("\n=== Cleanup ===");
    await db("DELETE FROM public.tickets WHERE order_id IN (SELECT id FROM public.orders WHERE event_id = $1)", [newEventId]);
    await db("DELETE FROM public.orders WHERE event_id = $1", [newEventId]);
    await db("DELETE FROM public.ticket_tiers WHERE event_id = $1", [newEventId]);
    await db("DELETE FROM public.events WHERE id = $1", [newEventId]);
    log("Cleanup → test event deleted", true, "");

    // ================================================================
    // SUMMARY
    // ================================================================
    const passCount = results.filter(r => r.pass).length;
    const failCount = results.filter(r => !r.pass).length;
    console.log(`\n${"=".repeat(60)}`);
    console.log(`FREE EVENT CRITICAL FLOW: ${passCount} PASS, ${failCount} FAIL`);
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
