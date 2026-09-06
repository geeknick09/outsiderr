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
const TEST_EMAIL = "official.outsiderr@gmail.com";
const TEST_PASSWORD = "123456";
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

async function login(page, context) {
  await goto(page, `${BASE}/login`);
  await page.locator('input[type="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button:has-text("Sign in")').last().click();
  await page.waitForTimeout(8000);
  const cookies = await context.cookies();
  return cookies.some(c => c.name.includes("auth-token"));
}

async function main() {
  await dbClient.connect();
  console.log("Connected to DB");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));

  try {
    // ================================================================
    // STEP 0: Login
    // ================================================================
    console.log("\n=== STEP 0: Login ===");
    const loggedIn = await login(page, context);
    log("Login", loggedIn, loggedIn ? "Auth cookie set" : "Failed");
    if (!loggedIn) { console.log("FATAL: Could not log in"); await browser.close(); await dbClient.end(); return; }

    // Get user ID
    const { rows: userRows } = await db("SELECT id FROM auth.users WHERE email = $1", [TEST_EMAIL]);
    const userId = userRows[0].id;

    // ================================================================
    // STEP 0.5: Ensure organizer profile exists
    // ================================================================
    console.log("\n=== STEP 0.5: Ensure Organizer Profile ===");
    const { rows: orgRows } = await db("SELECT id FROM public.organizers WHERE owner_id = $1", [userId]);
    if (orgRows.length === 0) {
      // Create organizer profile directly in DB
      await db(`
        INSERT INTO public.organizers (id, owner_id, name, bio, description, upi_id, verified, pan_number, pan_name, bank_account_number, bank_ifsc, bank_account_name, bank_account_type, kyc_submitted)
        VALUES (gen_random_uuid(), $1, 'QA Test Organizer', 'Testing events', 'QA test organizer for automated testing', 'test@upi', false, 'ABCDE1234F', 'QA TEST', '1234567890', 'SBIN0001234', 'QA TEST', 'SAVINGS', true)
      `, [userId]);
      log("Organizer profile created via DB", true, "Inserted");
    } else {
      log("Organizer profile exists", true, `id=${orgRows[0].id}`);
    }

    // ================================================================
    // FLOW A: Organizer Creates a New Event (PAID, FLAT pricing)
    // ================================================================
    console.log("\n=== FLOW A: Organizer Creates New Event ===");

    // Go to organizer create tab
    await goto(page, `${BASE}/organizer?tab=create`);

    // Fill the event form
    // Title
    await page.locator('input[name="title"]').first().fill("QA Test Event — Battle Night");

    // Category (select)
    await page.locator('select[name="category"]').first().selectOption("CYPHER_BATTLE");

    // City (select)
    await page.locator('select[name="city"]').first().selectOption("KOLKATA");

    // Starts at (datetime-local) — set to 30 days from now
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const futureDateStr = futureDate.toISOString().slice(0, 16);
    await page.locator('input[name="startsAt"]').first().fill(futureDateStr);

    // Ends at — 2 hours after start
    const endDate = new Date(futureDate.getTime() + 2 * 60 * 60 * 1000);
    const endDateStr = endDate.toISOString().slice(0, 16);
    const endsAtInput = page.locator('input[name="endsAt"]').first();
    if (await endsAtInput.isVisible().catch(() => false)) {
      await endsAtInput.fill(endDateStr);
    }

    // Venue mode — set to NOW (need to click the button)
    const venueNowBtn = page.locator('button:has-text("Announce now")').first();
    if (await venueNowBtn.isVisible().catch(() => false)) {
      // Already in NOW mode by default
    }

    // Venue name
    await page.locator('input[name="venueName"]').first().fill("QA Test Venue");

    // Venue address
    await page.locator('textarea[name="venueAddress"]').first().fill("123 Test Street, Kolkata");

    // Google Maps link
    await page.locator('input[name="googleMapsLink"]').first().fill("https://maps.google.com/?q=Kolkata");

    // Description
    await page.locator('textarea[name="description"]').first().fill("QA test event for automated testing.");

    // Things to know
    await page.locator('textarea[name="thingsToKnow"]').first().fill("Bring water\nNo alcohol\nRespect the space");

    // Terms
    await page.locator('textarea[name="terms"]').first().fill("No refunds\nEntry on valid ticket only");

    // Pricing mode — set to FLAT (need to click the FLAT button)
    const flatBtn = page.locator('button:has-text("Flat")').first();
    if (await flatBtn.isVisible().catch(() => false)) {
      await flatBtn.click();
      await page.waitForTimeout(1000);
    }

    // Tier price (FLAT mode has tierPrice and tierQuantity)
    await page.locator('input[name="tierPrice"]').first().fill("300");
    await page.locator('input[name="tierQuantity"]').first().fill("50");

    // Fee payer (select)
    const feePayerSelect = page.locator('select[name="feePayer"]').first();
    if (await feePayerSelect.isVisible().catch(() => false)) {
      await feePayerSelect.selectOption("BUYER");
    }

    // Organizer terms checkbox
    const termsCheckbox = page.locator('input[name="organizerTerms"]').first();
    if (await termsCheckbox.isVisible().catch(() => false)) {
      if (!(await termsCheckbox.isChecked())) await termsCheckbox.check();
    }

    // Submit the form
    const publishBtn = page.locator('button:has-text("Publish event")').first();
    const publishVisible = await publishBtn.isVisible().catch(() => false);
    log("Event create → form filled", publishVisible, publishVisible ? "Form ready" : "Form not visible");

    if (publishVisible) {
      await publishBtn.click();
      // Wait for redirect (303) to organizer event page
      await page.waitForURL("**/organizer/events/**", { timeout: 60000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);

      // Should redirect to organizer event page
      const afterUrl = page.url();
      const redirected = afterUrl.includes("/organizer/events/");
      log("Event create → redirect to event page", redirected, afterUrl);
      if (!redirected) {
        // Check if event was still created even if redirect didn't happen in time
        console.log("  No redirect, checking DB for event...");
      }

      // Verify in DB
      const { rows: newEvents } = await db(
        "SELECT id, title, status, pricing_mode, city FROM public.events WHERE title = 'QA Test Event — Battle Night' ORDER BY created_at DESC LIMIT 1"
      );
      if (newEvents.length > 0) {
        const newEventId = newEvents[0].id;
        log("Event create → event in DB", true, `id=${newEventId} status=${newEvents[0].status}`);
        log("Event create → status is PUBLISHED", newEvents[0].status === "PUBLISHED", `status=${newEvents[0].status}`);
        log("Event create → pricing_mode is FLAT", newEvents[0].pricing_mode === "FLAT", `mode=${newEvents[0].pricing_mode}`);
        log("Event create → city is KOLKATA", newEvents[0].city === "KOLKATA", `city=${newEvents[0].city}`);

        // Check tier created
        const { rows: newTiers } = await db("SELECT name, price_paise, quantity FROM public.ticket_tiers WHERE event_id = $1", [newEventId]);
        log("Event create → tier created", newTiers.length > 0, `${newTiers.length} tiers, price=${newTiers[0]?.price_paise}, qty=${newTiers[0]?.quantity}`);
        log("Event create → tier price is 30000 paise", newTiers.length > 0 && newTiers[0].price_paise === 30000, `price=${newTiers[0]?.price_paise}`);
        log("Event create → tier quantity is 50", newTiers.length > 0 && newTiers[0].quantity === 50, `qty=${newTiers[0]?.quantity}`);

        // ================================================================
        // FLOW B: Organizer Edits the Event
        // ================================================================
        console.log("\n=== FLOW B: Organizer Edits Event ===");

        // Go to the event edit page
        await goto(page, `${BASE}/organizer/events/${newEventId}`);
        await page.waitForTimeout(3000);

        // Change the title
        const editTitleInput = page.locator('input[name="title"]').first();
        if (await editTitleInput.isVisible().catch(() => false)) {
          await editTitleInput.fill("QA Test Event — Battle Night (EDITED)");

          // Change description
          const descInput = page.locator('textarea[name="description"]').first();
          if (await descInput.isVisible().catch(() => false)) {
            await descInput.fill("Updated description for QA test.");
          }

          // Click Save changes
          const saveBtn = page.locator('button:has-text("Save changes")').first();
          const saveVisible = await saveBtn.isVisible().catch(() => false);
          const saveDisabled = await saveBtn.isDisabled().catch(() => true);
          log("Event edit → Save button visible", saveVisible, `visible=${saveVisible} disabled=${saveDisabled}`);

          if (saveVisible && !saveDisabled) {
            await saveBtn.click();
            await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
            await page.waitForTimeout(5000);

            // Verify in DB
            const { rows: editedEvent } = await db("SELECT title, description FROM public.events WHERE id = $1", [newEventId]);
            log("Event edit → title updated", editedEvent[0]?.title === "QA Test Event — Battle Night (EDITED)", `title=${editedEvent[0]?.title}`);
            log("Event edit → description updated", editedEvent[0]?.description === "Updated description for QA test.", `desc=${editedEvent[0]?.description?.substring(0, 40)}`);
          } else {
            log("Event edit → Save button not clickable", false, `visible=${saveVisible} disabled=${saveDisabled}`);
          }
        } else {
          log("Event edit → title input not found", false, "");
        }

        // ================================================================
        // FLOW C: User Books the New Event → Ticket Generated → Tier Reduced
        // ================================================================
        console.log("\n=== FLOW C: User Books New Event ===");

        // Go to the event page
        await goto(page, `${BASE}/events/${newEventId}`);
        await page.waitForTimeout(3000);

        // Click "Book now"
        const bookBtn = page.locator('button:has-text("Book now")').first();
        const bookVisible = await bookBtn.isVisible().catch(() => false);
        if (bookVisible) {
          await bookBtn.click();
          await page.waitForTimeout(5000);
          await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
          await page.waitForTimeout(3000);

          // Check if we're on the checkout page
          const checkoutUrl = page.url();
          console.log("  After Book now, URL:", checkoutUrl);

          // Wait for the checkout form to render
          await page.waitForSelector('input[name="utrReference"]', { timeout: 30000 }).catch(() => {});
          await page.waitForTimeout(2000);

          // On checkout page — fill UTR and submit
          const utrInput = page.locator('input[name="utrReference"]').first();
          const utrVisible = await utrInput.isVisible().catch(() => false);
          console.log("  UTR input visible:", utrVisible);
          if (utrVisible) {
            await utrInput.fill(DUMMY_UTR);
            const nameInput = page.locator('input[name="buyerName"]').first();
            if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("QA Tester");

            // PhoneInput uses a visible tel input + hidden input with name="buyerPhone"
            // Fill the visible tel input to trigger React state update
            const phoneTel = page.locator('input[type="tel"]').first();
            if (await phoneTel.isVisible().catch(() => false)) await phoneTel.fill("9876543210");

            // Fill email if present
            const emailInput = page.locator('input[name="buyerEmail"]').first();
            if (await emailInput.isVisible().catch(() => false)) await emailInput.fill("qa@test.com");

            // Select gender if present
            const genderSelect = page.locator('select[name="buyerGender"]').first();
            if (await genderSelect.isVisible().catch(() => false)) {
              await genderSelect.selectOption("other").catch(() => {});
            }

            await page.locator('button:has-text("I\'ve paid")').first().click();
            await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
            await page.waitForTimeout(8000);

            // Check for error messages on the checkout page
            const allErrors = await page.locator('.text-red-500').allInnerTexts().catch(() => []);
            console.log("  Checkout errors on page:", allErrors);
            const afterCheckoutUrl = page.url();
            console.log("  After submit, URL:", afterCheckoutUrl);

            // Also check all text on page for error indicators
            const bodyText = await page.innerText("body").catch(() => "");
            const hasError = bodyText.includes("error") || bodyText.includes("Error") || bodyText.includes("failed") || bodyText.includes("Failed");
            if (hasError) {
              const errorMatch = bodyText.match(/(?:error|Error|failed|Failed)[^\n]{0,100}/);
              console.log("  Error text found:", errorMatch?.[0]);
            }

            // Verify pending order in DB
            const { rows: bookOrders } = await db(
              "SELECT id, status FROM public.orders WHERE user_id = $1 AND event_id = $2 ORDER BY created_at DESC LIMIT 1",
              [userId, newEventId]
            );
            log("Book new event → order created", bookOrders.length > 0, `status=${bookOrders[0]?.status}`);
            log("Book new event → status is PENDING_VERIFICATION", bookOrders.length > 0 && bookOrders[0].status === "PENDING_VERIFICATION", `status=${bookOrders[0]?.status}`);

            // ================================================================
            // FLOW D: Admin Approves the Order → Ticket Generated → Tier Reduced
            // ================================================================
            console.log("\n=== FLOW D: Admin Approves Order ===");

            const pendingOrderId = bookOrders[0]?.id;

            // Go to admin orders page
            await goto(page, `${BASE}/admin/orders`);
            await page.waitForTimeout(3000);

            // Find the Approve button for this order
            const approveForm = page.locator('form').filter({ hasText: "Approve" }).first();
            if (await approveForm.isVisible().catch(() => false)) {
              await approveForm.locator('button').first().click();
              await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
              await page.waitForTimeout(5000);

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
              // FLOW E: Door Staff — QR Check-in
              // ================================================================
              console.log("\n=== FLOW E: Door Staff QR Check-in ===");

              // Get the QR hash from the ticket
              const qrHash = approvedTickets[0]?.qr_hash;
              if (qrHash) {
                // Go to the door scanner page for this event
                await goto(page, `${BASE}/organizer/events/${newEventId}/scan`);
                // Wait for lazy-loaded scanner to appear
                await page.waitForSelector('input[placeholder="Enter ticket hash manually"]', { timeout: 30000 }).catch(() => {});
                await page.waitForTimeout(2000);

                // Enter the QR hash manually and submit
                const manualHashInput = page.locator('input[placeholder="Enter ticket hash manually"]').first();
                if (await manualHashInput.isVisible().catch(() => false)) {
                  await manualHashInput.fill(qrHash);
                  await page.locator('button:has-text("Check in")').first().click();
                  await page.waitForTimeout(5000);

                  // Verify in DB — ticket status should be USED
                  const { rows: checkedInTicket } = await db("SELECT status FROM public.tickets WHERE qr_hash = $1", [qrHash]);
                  log("Door scan → ticket status is USED", checkedInTicket[0]?.status === "USED", `status=${checkedInTicket[0]?.status}`);

                  // Try scanning again — should be ALREADY_USED
                  await manualHashInput.fill(qrHash);
                  await page.locator('button:has-text("Check in")').first().click();
                  await page.waitForTimeout(8000);

                  // Check the page for "ALREADY USED" message
                  const pageText = await page.innerText("body").catch(() => "");
                  const hasAlreadyUsed = pageText.includes("ALREADY USED") || pageText.includes("already used") || pageText.includes("Already used") || pageText.includes("↻");
                  log("Door scan → duplicate scan shows ALREADY USED", hasAlreadyUsed, hasAlreadyUsed ? "Found" : pageText.substring(0, 200));
                } else {
                  log("Door scan → manual hash input not found", false, "");
                }
              } else {
                log("Door scan → no QR hash available", false, "");
              }
            } else {
              log("Admin approve → Approve form not found", false, "");
            }
          } else {
            log("Book new event → UTR input not found", false, "");
          }
        } else {
          log("Book new event → Book now button not found", false, "");
        }

        // ================================================================
        // FLOW H: Hero Boost (use the QA event before it's cancelled/deleted)
        // ================================================================
        console.log("\n=== FLOW H: Hero Boost ===");

        // Go to organizer event page and purchase a hero boost
        await goto(page, `${BASE}/organizer/events/${newEventId}`);
        await page.waitForTimeout(3000);

        // Click "Feature My Event" button
        const featureBtn = page.locator('button:has-text("Feature My Event")').first();
        const featureVisible = await featureBtn.isVisible().catch(() => false);
        if (featureVisible) {
          await featureBtn.click();
          await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
          await page.waitForTimeout(5000);

          // Reload to see the UTR form
          await goto(page, `${BASE}/organizer/events/${newEventId}`);
          await page.waitForTimeout(3000);

          // Submit UTR
          const utrInputBoost = page.locator('input[name="utr"]').first();
          if (await utrInputBoost.isVisible().catch(() => false)) {
            await utrInputBoost.fill(DUMMY_UTR);
            await page.locator('button:has-text("Submit UTR")').first().click();
            await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
            await page.waitForTimeout(5000);
          }

          // Check if boost was created
          const { rows: pendingBoosts } = await db("SELECT id, status FROM public.hero_boosts WHERE event_id = $1 AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1", [newEventId]);
          if (pendingBoosts.length > 0) {
            const pendingBoostId = pendingBoosts[0].id;
            log("Hero boost → pending boost created", true, `id=${pendingBoostId}`);

            // Now go to admin boosts page and approve it
            await goto(page, `${BASE}/admin/boosts`);
            await page.waitForTimeout(3000);

            const activateBtn = page.locator('button:has-text("Verify & Activate")').first();
            const activateVisible = await activateBtn.isVisible().catch(() => false);
            if (activateVisible) {
              await activateBtn.click();
              await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
              await page.waitForTimeout(5000);

              // Verify in DB
              const { rows: activatedBoost } = await db("SELECT status FROM public.hero_boosts WHERE id = $1", [pendingBoostId]);
              log("Admin approve boost → status is ACTIVE", activatedBoost[0]?.status === "ACTIVE", `status=${activatedBoost[0]?.status}`);
            } else {
              log("Admin approve boost → Activate button not found", false, "");
            }
          } else {
            log("Hero boost → pending boost not created", false, "");
          }
        } else {
          log("Hero boost → Feature button not found", false, "Boost may already exist");
        }

        // ================================================================
        // FLOW F: Admin Cancels the Event (via admin events page)
        // ================================================================
        console.log("\n=== FLOW F: Admin Cancels Event ===");

        await goto(page, `${BASE}/admin/events`);
        await page.waitForTimeout(3000);

        // Find the Cancel button for our event using Playwright locators
        // The card contains a link to /events/{eventId}
        const eventLink = page.locator(`a[href="/events/${newEventId}"]`).first();
        const eventCard = eventLink.locator('xpath=ancestor::div[contains(@class,"glass")][1]');
        const cancelBtn = eventCard.locator('button:has-text("Cancel")').first();
        const cancelVisible = await cancelBtn.isVisible().catch(() => false);
        if (cancelVisible) {
          await cancelBtn.click();
          await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
          await page.waitForTimeout(8000);

          const { rows: cancelledEvent } = await db("SELECT status FROM public.events WHERE id = $1", [newEventId]);
          log("Admin cancel event → status is CANCELLED", cancelledEvent[0]?.status === "CANCELLED", `status=${cancelledEvent[0]?.status}`);
        } else {
          log("Admin cancel event → Cancel button not found", false, "");
        }

        // ================================================================
        // FLOW G: Admin Deletes the Event
        // ================================================================
        console.log("\n=== FLOW G: Admin Deletes Event ===");

        // Reload the admin events page
        await goto(page, `${BASE}/admin/events`);
        await page.waitForTimeout(3000);

        // Find the Delete button for our event using Playwright locators
        const deleteLink = page.locator(`a[href="/events/${newEventId}"]`).first();
        const deleteCard = deleteLink.locator('xpath=ancestor::div[contains(@class,"glass")][1]');
        const deleteBtn = deleteCard.locator('button:has-text("Delete")').first();
        const deleteVisible = await deleteBtn.isVisible().catch(() => false);
        if (deleteVisible) {
          await deleteBtn.click();
          await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
          await page.waitForTimeout(8000);

          const { rows: deletedEvent } = await db("SELECT id FROM public.events WHERE id = $1", [newEventId]);
          log("Admin delete event → event removed from DB", deletedEvent.length === 0, `rows=${deletedEvent.length}`);

          // Verify seed events still exist
          const { rows: remainingEvents } = await db("SELECT count(*) as cnt FROM public.events WHERE title NOT LIKE 'QA Test%'");
          log("Admin delete → seed events preserved", parseInt(remainingEvents[0].cnt) > 0, `${remainingEvents[0].cnt} seed events remaining`);
        } else {
          log("Admin delete event → Delete button not found", false, "");
        }

      } else {
        log("Event create → event in DB", false, "No event found");
      }
    }

    // ================================================================
    // FLOW I: Admin Toggle Featured Event (use a seed event)
    // ================================================================
    // FLOW I: Admin Toggle Featured Event (use a seed event, before QA event is deleted)
    // ================================================================
    console.log("\n=== FLOW I: Admin Toggle Featured ===");

    const { rows: pubEventsForFeature } = await db("SELECT id, title, is_featured FROM public.events WHERE status = 'PUBLISHED' AND title NOT LIKE 'QA Test%' LIMIT 1");
    if (pubEventsForFeature.length > 0) {
      const featuredEventId = pubEventsForFeature[0].id;
      const wasFeatured = pubEventsForFeature[0].is_featured;

      await goto(page, `${BASE}/admin/events`);
      await page.waitForTimeout(3000);

      // Find the Feature/Unfeature button using Playwright locators
      const featureLink = page.locator(`a[href="/events/${featuredEventId}"]`).first();
      const featureCard = featureLink.locator('xpath=ancestor::div[contains(@class,"glass")][1]');
      const featureBtn = featureCard.locator('button:has-text("Feature"), button:has-text("Unfeature")').first();
      const featureVisible = await featureBtn.isVisible().catch(() => false);

      if (featureVisible) {
        await featureBtn.click();
        await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(5000);

        const { rows: afterFeature } = await db("SELECT is_featured FROM public.events WHERE id = $1", [featuredEventId]);
        log("Admin toggle featured → is_featured changed", afterFeature[0]?.is_featured === !wasFeatured, `before=${wasFeatured} after=${afterFeature[0]?.is_featured}`);
      } else {
        log("Admin toggle featured → button not found", false, "");
      }
    } else {
      log("Admin toggle featured → no published seed events", false, "");
    }

    // ================================================================
    // FLOW J: Admin Update Platform Setting
    // ================================================================
    console.log("\n=== FLOW J: Admin Update Platform Setting ===");

    await goto(page, `${BASE}/admin/settings`);
    await page.waitForTimeout(3000);

    // Find a setting input and update it
    const settingsInputs = await page.locator('input[type="text"], input[type="number"]').count();
    log("Admin settings → page loads with inputs", settingsInputs > 0, `${settingsInputs} inputs found`);

    // ================================================================
    // FLOW K: Admin Re-publish a Cancelled Event (use a seed event)
    // ================================================================
    console.log("\n=== FLOW K: Admin Re-publish Cancelled Event ===");

    // Cancel a seed event first, then re-publish it
    const { rows: seedEventForRepublish } = await db("SELECT id, title FROM public.events WHERE status = 'PUBLISHED' AND title NOT LIKE 'QA Test%' LIMIT 1");
    if (seedEventForRepublish.length > 0) {
      const republishEventId = seedEventForRepublish[0].id;

      // Cancel it via admin page
      await goto(page, `${BASE}/admin/events`);
      await page.waitForTimeout(3000);

      // Find the Cancel button using Playwright locators
      const republishLink = page.locator(`a[href="/events/${republishEventId}"]`).first();
      const republishCard = republishLink.locator('xpath=ancestor::div[contains(@class,"glass")][1]');
      const republishCancelBtn = republishCard.locator('button:has-text("Cancel")').first();
      const republishCancelVisible = await republishCancelBtn.isVisible().catch(() => false);

      if (republishCancelVisible) {
        await republishCancelBtn.click();
        await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(5000);

        const { rows: afterCancel } = await db("SELECT status FROM public.events WHERE id = $1", [republishEventId]);
        log("Admin re-publish → event cancelled first", afterCancel[0]?.status === "CANCELLED", `status=${afterCancel[0]?.status}`);

        if (afterCancel[0]?.status === "CANCELLED") {
          // Now re-publish
          await goto(page, `${BASE}/admin/events`);
          await page.waitForTimeout(3000);

          const republishLink2 = page.locator(`a[href="/events/${republishEventId}"]`).first();
          const republishCard2 = republishLink2.locator('xpath=ancestor::div[contains(@class,"glass")][1]');
          const republishBtn = republishCard2.locator('button:has-text("Re-publish")').first();
          const republishVisible = await republishBtn.isVisible().catch(() => false);

          if (republishVisible) {
            await republishBtn.click();
            await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
            await page.waitForTimeout(5000);

            const { rows: afterRepublish } = await db("SELECT status FROM public.events WHERE id = $1", [republishEventId]);
            log("Admin re-publish → status is PUBLISHED", afterRepublish[0]?.status === "PUBLISHED", `status=${afterRepublish[0]?.status}`);
          } else {
            log("Admin re-publish → Re-publish button not found", false, "");
          }
        }
      } else {
        log("Admin re-publish → Cancel button not found for seed event", false, "");
      }
    } else {
      log("Admin re-publish → no published seed events", false, "");
    }

    // ================================================================
    // FLOW L: Console Errors Check
    // ================================================================
    console.log("\n=== FLOW L: Console Errors ===");
    const realErrors = consoleErrors.filter(e =>
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
    console.log(`FINAL CRITICAL FLOW TEST RESULTS: ${passCount} PASS, ${failCount} FAIL`);
    console.log(`${"=".repeat(60)}`);

    if (failCount > 0) {
      console.log("\nFailed tests:");
      results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.name}${r.detail ? " — " + r.detail : ""}`));
    }

  } catch (err) {
    console.error("FATAL ERROR:", err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
    await dbClient.end();
  }
}

main().catch(console.error);
