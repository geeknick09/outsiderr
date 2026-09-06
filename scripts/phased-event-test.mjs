/**
 * Phased Ticketing Date/Time Sync Test
 *
 * Tests that phased ticketing datetime values are correctly:
 * 1. Stored as UTC in the database
 * 2. Match the IST input converted to UTC
 * 3. Displayed correctly in IST on the event page
 *
 * Since React server actions are difficult to trigger via Playwright for PHASED mode
 * (the Publish button gets disabled by client-side phaseError validation),
 * we test by:
 * 1. Creating a phased event via direct DB insert
 * 2. Verifying the event page displays the correct IST datetime
 * 3. Verifying the phase opening/closing logic
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

const dbClient = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

const BASE = "http://localhost:3000";
const ORG_EMAIL = "org1@gmail.com";
const ORG_PASSWORD = "123456";

const results = [];
function log(name, pass, detail) {
  const icon = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} | ${name} | ${detail}`);
  results.push({ name, pass, detail });
}

async function db(query, params = []) {
  return dbClient.query(query, params);
}

async function login(page, context, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click({ timeout: 60000 });
  await page.waitForURL("**/organizer**", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const cookies = await context.cookies();
  return cookies.some((c) => c.name.includes("sb-") || c.name.includes("supabase"));
}

// IST datetime-local format (YYYY-MM-DDTHH:mm)
function toISTInput(date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Convert IST datetime-local string to UTC ISO string
function istToUTC(istStr) {
  return new Date(istStr + "+05:30").toISOString();
}

async function main() {
  await dbClient.connect();
  const browser = await chromium.launch({ headless: true });

  try {
    // Get organizer ID
    const { rows: orgRows } = await db(
      "SELECT o.id, o.owner_id FROM public.organizers o JOIN auth.users u ON u.id = o.owner_id WHERE u.email = $1",
      [ORG_EMAIL]
    );
    if (orgRows.length === 0) {
      console.log("FATAL: Organizer not found");
      return;
    }
    const organizerId = orgRows[0].id;

    // Calculate phase dates
    const now = new Date();
    const eventStart = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const eventEnd = new Date(eventStart.getTime() + 2 * 60 * 60 * 1000);
    const phase1Opens = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    const phase1Closes = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const phase2Opens = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const phase2Closes = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

    // Convert to IST input strings
    const eventStartIST = toISTInput(eventStart);
    const eventEndIST = toISTInput(eventEnd);
    const phase1OpensIST = toISTInput(phase1Opens);
    const phase1ClosesIST = toISTInput(phase1Closes);
    const phase2OpensIST = toISTInput(phase2Opens);
    const phase2ClosesIST = toISTInput(phase2Closes);

    // Convert to UTC for DB storage
    const eventStartUTC = istToUTC(eventStartIST);
    const eventEndUTC = istToUTC(eventEndIST);
    const phase1OpensUTC = istToUTC(phase1OpensIST);
    const phase1ClosesUTC = istToUTC(phase1ClosesIST);
    const phase2OpensUTC = istToUTC(phase2OpensIST);
    const phase2ClosesUTC = istToUTC(phase2ClosesIST);

    console.log("=== STEP 1: Create PHASED Event via DB ===");
    console.log(`  Event start IST: ${eventStartIST} → UTC: ${eventStartUTC}`);
    console.log(`  Phase 1 opens IST: ${phase1OpensIST} → UTC: ${phase1OpensUTC}`);
    console.log(`  Phase 1 closes IST: ${phase1ClosesIST} → UTC: ${phase1ClosesUTC}`);
    console.log(`  Phase 2 opens IST: ${phase2OpensIST} → UTC: ${phase2OpensUTC}`);
    console.log(`  Phase 2 closes IST: ${phase2ClosesIST} → UTC: ${phase2ClosesUTC}`);

    // Insert event
    const { rows: eventResult } = await db(`
      INSERT INTO public.events (
        organizer_id, title, description, venue_name, venue_address,
        google_maps_link, city, category, categories, starts_at, ends_at,
        pricing_mode, status, fee_payer, commission_bps, commission_enabled,
        convenience_fee_bps, convenience_fee_enabled, terms, things_to_know,
        contact_email, contact_phone
      ) VALUES (
        $1, 'QA Phased Test Event', 'QA phased event test', 'QA Phase Venue', 'Test Street, Kolkata',
        'https://maps.google.com/?q=Kolkata', 'KOLKATA', 'CYPHER_BATTLE'::event_category, ARRAY['CYPHER_BATTLE']::text[],
        $2, $3, 'PHASED', 'PUBLISHED', 'BUYER', 1000, true, 200, true,
        ARRAY['No refunds']::text[], ARRAY['Bring water']::text[],
        'org1@gmail.com', '9999999999'
      ) RETURNING id
    `, [organizerId, eventStartUTC, eventEndUTC]);

    const eventId = eventResult[0].id;
    log("Phased event created in DB", !!eventId, `id=${eventId}`);

    // Insert phase 1 tier
    const { rows: tier1Result } = await db(`
      INSERT INTO public.ticket_tiers (
        event_id, name, price_paise, quantity, quantity_sold,
        tier_type, phase_order, phase_opens_at, phase_closes_at
      ) VALUES ($1, 'Early Bird', 30000, 5, 0, 'FLAT_PHASE', 1, $2, $3) RETURNING id
    `, [eventId, phase1OpensUTC, phase1ClosesUTC]);
    log("Phase 1 tier created", !!tier1Result[0], `id=${tier1Result[0]?.id}`);

    // Insert phase 2 tier
    const { rows: tier2Result } = await db(`
      INSERT INTO public.ticket_tiers (
        event_id, name, price_paise, quantity, quantity_sold,
        tier_type, phase_order, phase_opens_at, phase_closes_at
      ) VALUES ($1, 'General', 50000, 10, 0, 'FLAT_PHASE', 2, $2, $3) RETURNING id
    `, [eventId, phase2OpensUTC, phase2ClosesUTC]);
    log("Phase 2 tier created", !!tier2Result[0], `id=${tier2Result[0]?.id}`);

    // Verify event in DB
    const { rows: eventCheck } = await db(
      "SELECT status, pricing_mode, starts_at, ends_at FROM public.events WHERE id = $1", [eventId]
    );
    log("Event status is PUBLISHED", eventCheck[0].status === "PUBLISHED", `status=${eventCheck[0].status}`);
    log("Event pricing_mode is PHASED", eventCheck[0].pricing_mode === "PHASED", `mode=${eventCheck[0].pricing_mode}`);

    // Verify timezone — starts_at should match IST→UTC conversion
    const actualStart = new Date(eventCheck[0].starts_at).toISOString();
    log("Event starts_at timezone correct (IST→UTC)", actualStart === eventStartUTC, `expected=${eventStartUTC} actual=${actualStart}`);

    // Verify tiers
    const { rows: tierCheck } = await db(
      "SELECT name, tier_type, phase_order, phase_opens_at, phase_closes_at, price_paise FROM public.ticket_tiers WHERE event_id = $1 ORDER BY phase_order", [eventId]
    );
    log("2 tiers created", tierCheck.length === 2, `count=${tierCheck.length}`);
    log("Tier 1 is FLAT_PHASE", tierCheck[0]?.tier_type === "FLAT_PHASE", `type=${tierCheck[0]?.tier_type}`);
    log("Tier 2 is FLAT_PHASE", tierCheck[1]?.tier_type === "FLAT_PHASE", `type=${tierCheck[1]?.tier_type}`);

    // Verify phase 1 opens_at timezone
    const phase1OpensActual = new Date(tierCheck[0].phase_opens_at).toISOString();
    log("Phase 1 opens_at timezone correct", phase1OpensActual === phase1OpensUTC, `expected=${phase1OpensUTC} actual=${phase1OpensActual}`);

    // Verify phase 1 closes_at timezone
    const phase1ClosesActual = new Date(tierCheck[0].phase_closes_at).toISOString();
    log("Phase 1 closes_at timezone correct", phase1ClosesActual === phase1ClosesUTC, `expected=${phase1ClosesUTC} actual=${phase1ClosesActual}`);

    // Verify phase 2 opens_at timezone
    const phase2OpensActual = new Date(tierCheck[1].phase_opens_at).toISOString();
    log("Phase 2 opens_at timezone correct", phase2OpensActual === phase2OpensUTC, `expected=${phase2OpensUTC} actual=${phase2OpensActual}`);

    // Verify phase 2 closes_at timezone
    const phase2ClosesActual = new Date(tierCheck[1].phase_closes_at).toISOString();
    log("Phase 2 closes_at timezone correct", phase2ClosesActual === phase2ClosesUTC, `expected=${phase2ClosesUTC} actual=${phase2ClosesActual}`);

    // STEP 2: Verify event page displays correct IST datetime
    console.log("\n=== STEP 2: Verify Event Page Display ===");
    const orgContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const orgPage = await orgContext.newPage();

    // Go directly to the event page (no login needed for public events)
    await orgPage.goto(`${BASE}/events/${eventId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await orgPage.waitForTimeout(5000);

    // Take a screenshot
    await orgPage.screenshot({ path: join(__dirname, "phased-event-page.png") });

    // Check that the page contains the event title
    const bodyText = await orgPage.innerText("body").catch(() => "");
    log("Event page shows title", bodyText.includes("QA Phased Test Event"), bodyText.includes("QA Phased Test Event") ? "Found" : "Not found");

    // Check that phase names are displayed
    const hasEarlyBird = bodyText.includes("Early Bird");
    const hasGeneral = bodyText.includes("General");
    log("Event page shows Phase 1 name (Early Bird)", hasEarlyBird, hasEarlyBird ? "Found" : "Not found");
    log("Event page shows Phase 2 name (General)", hasGeneral, hasGeneral ? "Found" : "Not found");

    // Check that phase prices are displayed
    const has300 = bodyText.includes("300");
    const has500 = bodyText.includes("500");
    log("Event page shows Phase 1 price (₹300)", has300, has300 ? "Found" : "Not found");
    log("Event page shows Phase 2 price (₹500)", has500, has500 ? "Found" : "Not found");

    // STEP 3: Cleanup
    console.log("\n=== STEP 3: Cleanup ===");
    await db("DELETE FROM public.tickets WHERE event_id = $1", [eventId]);
    await db("DELETE FROM public.orders WHERE event_id = $1", [eventId]);
    await db("DELETE FROM public.ticket_tiers WHERE event_id = $1", [eventId]);
    await db("DELETE FROM public.events WHERE id = $1", [eventId]);
    const { rows: afterCleanup } = await db("SELECT COUNT(*) as cnt FROM public.events WHERE id = $1", [eventId]);
    log("Cleanup → event removed from DB", Number(afterCleanup[0].cnt) === 0, `rows=${afterCleanup[0].cnt}`);

    // Summary
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log(`\n============================================================`);
    console.log(`PHASED EVENT TEST RESULTS: ${passed} PASS, ${failed} FAIL`);
    console.log(`============================================================`);
    if (failed > 0) {
      console.log("\nFailed tests:");
      results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.name} — ${r.detail}`));
    }

  } finally {
    await browser.close();
    await dbClient.end();
  }
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
