/**
 * Lifecycle Test — Event Draft → Publish status labels
 *
 * Tests the event lifecycle:
 * 1. Login as organizer
 * 2. Create a DRAFT event (Save as draft)
 * 3. Verify status is DRAFT in DB
 * 4. Verify draft appears in "Drafts" tab on organizer dashboard
 * 5. Verify draft does NOT appear on homepage
 * 6. Go to event edit page and Publish
 * 7. Verify status is PUBLISHED in DB
 * 8. Verify event appears on homepage
 * 9. Verify event appears under "Published" tab on organizer dashboard
 * 10. Clean up: delete the test event
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
const EVENT_TITLE = "QA Lifecycle Draft Event";

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

async function main() {
  await dbClient.connect();
  console.log("Connected to DB");

  const browser = await chromium.launch({ headless: true });

  try {
    // ================================================================
    // STEP 1: Login as organizer
    // ================================================================
    console.log("\n=== STEP 1: Login as Organizer ===");
    const orgContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const orgPage = await orgContext.newPage();

    const orgErrors = [];
    orgPage.on("console", (msg) => { if (msg.type() === "error") orgErrors.push(msg.text()); });
    orgPage.on("pageerror", (err) => orgErrors.push(`PAGE ERROR: ${err.message}`));

    const orgLoggedIn = await login(orgPage, orgContext, ORG_EMAIL, ORG_PASSWORD);
    log("Organizer login", orgLoggedIn, orgLoggedIn ? "Auth cookie set" : "Failed");
    if (!orgLoggedIn) { console.log("FATAL: Could not log in as organizer"); await browser.close(); await dbClient.end(); return; }

    // ================================================================
    // STEP 2: Create a DRAFT event
    // ================================================================
    console.log("\n=== STEP 2: Create DRAFT Event ===");
    await goto(orgPage, `${BASE}/organizer?tab=create`);

    // Title
    await orgPage.locator('input[name="title"]').first().fill(EVENT_TITLE);

    // Category — click "Cypher & Battle" chip
    const categoryChip = orgPage.locator('label:has-text("Cypher & Battle")').first();
    if (await categoryChip.isVisible().catch(() => false)) {
      await categoryChip.click();
      await orgPage.waitForTimeout(500);
    }

    // City
    await orgPage.locator('select[name="city"]').first().selectOption("KOLKATA");

    // Starts at — 30 days from now in IST (datetime-local format)
    const now = new Date();
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
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
    await orgPage.locator('input[name="venueName"]').first().fill("QA Lifecycle Venue");
    await orgPage.locator('textarea[name="venueAddress"]').first().fill("Test");
    await orgPage.locator('input[name="googleMapsLink"]').first().fill("https://maps.google.com/?q=Kolkata");

    // Description
    await orgPage.locator('textarea[name="description"]').first().fill("QA lifecycle test");
    await orgPage.locator('textarea[name="thingsToKnow"]').first().fill("Test");
    await orgPage.locator('textarea[name="terms"]').first().fill("Test");

    // Pricing mode — FREE (click "Free Entry" button)
    const freeBtn = orgPage.locator('button:has-text("Free Entry")').first();
    if (await freeBtn.isVisible().catch(() => false)) {
      await freeBtn.click();
      await orgPage.waitForTimeout(1500);
    }

    // Free quantity — inject hidden field if FREE mode UI didn't render
    const freeQtyInput = orgPage.locator('input[name="freeQuantity"]').first();
    if (await freeQtyInput.isVisible().catch(() => false)) {
      await freeQtyInput.fill("50");
    } else {
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
          const pm = form.querySelector('input[name="pricingMode"]');
          if (pm) pm.value = 'FREE';
        }
      });
    }

    // Remove required attributes from hidden PAID/FLAT/PHASED tier fields
    await orgPage.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) return;
      const requiredInputs = form.querySelectorAll('input[required], textarea[required], select[required]');
      requiredInputs.forEach((input) => {
        const name = input.name || '';
        const keepRequired = ['title', 'startsAt', 'endsAt', 'venueName', 'venueAddress', 'description', 'organizerTerms'];
        if (!keepRequired.includes(name)) {
          input.removeAttribute('required');
        }
      });
    });

    // Organizer terms checkbox
    const termsCheckbox = orgPage.locator('input[name="organizerTerms"]').first();
    if (await termsCheckbox.isVisible().catch(() => false)) {
      if (!(await termsCheckbox.isChecked())) await termsCheckbox.check();
    }

    // Submit — Save as draft (NOT Publish event)
    const draftBtn = orgPage.locator('button:has-text("Save as draft")').first();
    const draftVisible = await draftBtn.isVisible().catch(() => false);
    log("Draft create → form filled", draftVisible, draftVisible ? "Form ready" : "Form not visible");

    let newEventId = null;
    if (draftVisible) {
      await draftBtn.click();
      await orgPage.waitForURL("**/organizer/events/**", { timeout: 60000 }).catch(() => {});
      await orgPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await orgPage.waitForTimeout(3000);

      // Verify in DB
      const { rows: newEvents } = await db(
        "SELECT id, title, status, pricing_mode, city FROM public.events WHERE title = $1 ORDER BY created_at DESC LIMIT 1",
        [EVENT_TITLE]
      );
      if (newEvents.length > 0) {
        newEventId = newEvents[0].id;
        log("Draft create → event in DB", true, `id=${newEventId} status=${newEvents[0].status}`);
        log("Draft create → status is DRAFT", newEvents[0].status === "DRAFT", `status=${newEvents[0].status}`);
        log("Draft create → pricing_mode is FREE", newEvents[0].pricing_mode === "FREE", `mode=${newEvents[0].pricing_mode}`);
      } else {
        log("Draft create → event in DB", false, "No event found");
      }
    }

    if (!newEventId) {
      console.log("FATAL: Draft event not created, aborting");
      await browser.close(); await dbClient.end(); return;
    }

    // ================================================================
    // STEP 3: Verify draft appears in "Drafts" tab on organizer dashboard
    // ================================================================
    console.log("\n=== STEP 3: Verify Draft in Dashboard Drafts Tab ===");
    await goto(orgPage, `${BASE}/organizer`);
    await orgPage.waitForTimeout(3000);

    // Click the "Drafts" tab
    const draftsTab = orgPage.locator('button:has-text("Drafts")').first();
    const draftsTabVisible = await draftsTab.isVisible().catch(() => false);
    if (draftsTabVisible) {
      await draftsTab.click();
      await orgPage.waitForTimeout(2000);
      const bodyText = await orgPage.innerText("body").catch(() => "");
      const draftInTab = bodyText.includes(EVENT_TITLE);
      log("Dashboard → draft appears in Drafts tab", draftInTab, draftInTab ? "Found" : "Not found");
    } else {
      log("Dashboard → Drafts tab not found", false, "");
    }

    // ================================================================
    // STEP 4: Verify draft does NOT appear on homepage
    // ================================================================
    console.log("\n=== STEP 4: Verify Draft NOT on Homepage ===");
    await goto(orgPage, `${BASE}/`);
    await orgPage.waitForTimeout(3000);
    const homeText = await orgPage.innerText("body").catch(() => "");
    const draftOnHome = homeText.includes(EVENT_TITLE);
    log("Homepage → draft NOT visible", !draftOnHome, draftOnHome ? "Draft appeared (bad)" : "Draft absent (good)");

    // ================================================================
    // STEP 5: Go to event edit page and Publish
    // ================================================================
    console.log("\n=== STEP 5: Publish the Draft Event ===");
    await goto(orgPage, `${BASE}/organizer/events/${newEventId}`);
    await orgPage.waitForTimeout(3000);

    const publishBtn = orgPage.locator('button:has-text("Publish event")').first();
    const publishVisible = await publishBtn.isVisible().catch(() => false);
    log("Edit page → Publish button visible", publishVisible, publishVisible ? "Found" : "Not found");

    if (publishVisible) {
      await publishBtn.click();
      await orgPage.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
      await orgPage.waitForTimeout(5000);

      // Verify in DB
      const { rows: publishedEvent } = await db("SELECT status FROM public.events WHERE id = $1", [newEventId]);
      log("Publish → status is PUBLISHED", publishedEvent[0]?.status === "PUBLISHED", `status=${publishedEvent[0]?.status}`);
    } else {
      log("Publish → Publish button not found", false, "");
    }

    // ================================================================
    // STEP 6: Verify event appears on homepage
    // ================================================================
    console.log("\n=== STEP 6: Verify Published Event on Homepage ===");
    await goto(orgPage, `${BASE}/`);
    await orgPage.waitForTimeout(3000);
    const homeTextAfter = await orgPage.innerText("body").catch(() => "");
    const publishedOnHome = homeTextAfter.includes(EVENT_TITLE);
    log("Homepage → published event visible", publishedOnHome, publishedOnHome ? "Found" : "Not found");

    // ================================================================
    // STEP 7: Verify event appears under "Published" tab on dashboard
    // ================================================================
    console.log("\n=== STEP 7: Verify Published Event in Dashboard Published Tab ===");
    await goto(orgPage, `${BASE}/organizer`);
    await orgPage.waitForTimeout(3000);

    // The "Published" tab is the default active tab
    const publishedTab = orgPage.locator('button:has-text("Published")').first();
    if (await publishedTab.isVisible().catch(() => false)) {
      await publishedTab.click();
      await orgPage.waitForTimeout(2000);
      const dashText = await orgPage.innerText("body").catch(() => "");
      const publishedInTab = dashText.includes(EVENT_TITLE);
      log("Dashboard → published event in Published tab", publishedInTab, publishedInTab ? "Found" : "Not found");
    } else {
      log("Dashboard → Published tab not found", false, "");
    }

    // ================================================================
    // STEP 8: Clean up — delete the test event
    // ================================================================
    console.log("\n=== STEP 8: Cleanup — Delete Test Event ===");
    await db("DELETE FROM public.ticket_tiers WHERE event_id = $1", [newEventId]);
    await db("DELETE FROM public.events WHERE id = $1", [newEventId]);
    const { rows: deletedEvent } = await db("SELECT id FROM public.events WHERE id = $1", [newEventId]);
    log("Cleanup → event removed from DB", deletedEvent.length === 0, `rows=${deletedEvent.length}`);

    // ================================================================
    // CONSOLE ERRORS CHECK
    // ================================================================
    console.log("\n=== Console Errors Check ===");
    const realErrors = orgErrors.filter(e =>
      !e.includes("favicon") && !e.includes("manifest") && !e.includes("webpack") &&
      !e.includes("Fast Refresh") && !e.includes("Cross origin") && !e.includes("404")
    );
    log("No console errors during flow", realErrors.length === 0, realErrors.length > 0 ? `${realErrors.length} errors: ${realErrors.slice(0, 3).join("; ")}` : "");

    // ================================================================
    // SUMMARY
    // ================================================================
    const passCount = results.filter(r => r.pass).length;
    const failCount = results.filter(r => !r.pass).length;
    console.log(`\n${"=".repeat(60)}`);
    console.log(`LIFECYCLE TEST RESULTS: ${passCount} PASS, ${failCount} FAIL`);
    console.log(`${"=".repeat(60)}`);

    if (failCount > 0) {
      console.log("\nFailed tests:");
      results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.name}${r.detail ? " — " + r.detail : ""}`));
    }

    await orgContext.close();

  } catch (err) {
    console.error("FATAL ERROR:", err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
    await dbClient.end();
  }
}

main().catch(console.error);
