/**
 * TBA Venue + Category Rename Test
 *
 * 1. Creates an event with TBA venue via DB
 * 2. Verifies the event page shows TBA and the map is not clickable
 * 3. Verifies the category "Hip Hop/Rap Party" is displayed correctly
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

const results = [];
function log(name, pass, detail) {
  const icon = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} | ${name} | ${detail}`);
  results.push({ name, pass, detail });
}

function toISTInput(date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function istToUTC(istStr) {
  return new Date(istStr + "+05:30").toISOString();
}

async function main() {
  await dbClient.connect();
  const browser = await chromium.launch({ headless: true });

  try {
    // Get organizer ID
    const { rows: orgRows } = await dbClient.query(
      "SELECT o.id FROM public.organizers o JOIN auth.users u ON u.id = o.owner_id WHERE u.email = 'org1@gmail.com'"
    );
    const organizerId = orgRows[0].id;

    const now = new Date();
    const eventStart = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const eventEnd = new Date(eventStart.getTime() + 2 * 60 * 60 * 1000);
    const eventStartUTC = istToUTC(toISTInput(eventStart));
    const eventEndUTC = istToUTC(toISTInput(eventEnd));

    // Create event with TBA venue and HIP_HOP_PARTY category
    const { rows: eventResult } = await dbClient.query(`
      INSERT INTO public.events (
        organizer_id, title, description, venue_name, venue_address,
        google_maps_link, city, category, categories, starts_at, ends_at,
        pricing_mode, status, fee_payer, commission_bps, commission_enabled,
        convenience_fee_bps, convenience_fee_enabled, terms, things_to_know,
        contact_email, contact_phone
      ) VALUES (
        $1, 'QA TBA Venue Test', 'QA TBA venue test', 'TBA', '',
        null, 'KOLKATA', 'HIP_HOP_PARTY'::event_category, ARRAY['HIP_HOP_PARTY']::text[],
        $2, $3, 'FLAT', 'PUBLISHED', 'BUYER', 1000, true, 200, true,
        ARRAY['No refunds']::text[], ARRAY['Bring water']::text[],
        'org1@gmail.com', '9999999999'
      ) RETURNING id
    `, [organizerId, eventStartUTC, eventEndUTC]);

    const eventId = eventResult[0].id;
    log("TBA venue event created", !!eventId, `id=${eventId}`);

    // Add a ticket tier
    await dbClient.query(`
      INSERT INTO public.ticket_tiers (event_id, name, price_paise, quantity, quantity_sold, tier_type)
      VALUES ($1, 'Entry', 30000, 50, 0, 'FLAT')
    `, [eventId]);

    // Verify TBA venue in DB
    const { rows: eventCheck } = await dbClient.query(
      "SELECT venue_name, venue_address, google_maps_link, category, categories FROM public.events WHERE id = $1", [eventId]
    );
    log("Venue name is TBA", eventCheck[0].venue_name === "TBA", `venue=${eventCheck[0].venue_name}`);
    log("Venue address is empty", eventCheck[0].venue_address === "", `address="${eventCheck[0].venue_address}"`);
    log("Google Maps link is null", eventCheck[0].google_maps_link === null, `maps=${eventCheck[0].google_maps_link}`);
    log("Category is HIP_HOP_PARTY", eventCheck[0].category === "HIP_HOP_PARTY", `category=${eventCheck[0].category}`);

    // Visit the event page
    console.log("\n=== STEP 2: Verify Event Page ===");
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${BASE}/events/${eventId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(5000);

    const bodyText = await page.innerText("body").catch(() => "");
    log("Event page shows title", bodyText.includes("QA TBA Venue Test"), "Found");

    // Check TBA is displayed
    const hasTBA = bodyText.includes("TBA") || bodyText.includes("To be announced") || bodyText.includes("Venue TBA");
    log("Event page shows TBA venue", hasTBA, hasTBA ? "Found" : "Not found");

    // Check that the map link is NOT clickable (no anchor tag with maps link)
    const mapLinks = await page.locator('a[href*="maps.google.com"], a[href*="google.com/maps"]').count();
    log("Map link is NOT clickable (no maps anchor)", mapLinks === 0, `mapLinks=${mapLinks}`);

    // Check Hip Hop/Rap Party category is displayed
    const hasHipHop = bodyText.includes("Hip Hop/Rap Party") || bodyText.includes("Hip Hop") || bodyText.includes("Rap Party");
    log("Event page shows Hip Hop/Rap Party category", hasHipHop, hasHipHop ? "Found" : "Not found");

    // Take screenshot
    await page.screenshot({ path: join(__dirname, "tba-venue-event.png") });

    // Cleanup
    console.log("\n=== STEP 3: Cleanup ===");
    await dbClient.query("DELETE FROM public.ticket_tiers WHERE event_id = $1", [eventId]);
    await dbClient.query("DELETE FROM public.events WHERE id = $1", [eventId]);
    log("Cleanup → event removed", true, "OK");

    // Summary
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log(`\n============================================================`);
    console.log(`TBA VENUE + CATEGORY TEST RESULTS: ${passed} PASS, ${failed} FAIL`);
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
