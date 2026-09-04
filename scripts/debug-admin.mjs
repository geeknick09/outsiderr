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
const dbClient = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await dbClient.connect();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill("official.outsiderr@gmail.com");
  await page.locator('input[type="password"]').first().fill("123456");
  await page.locator('button:has-text("Sign in")').last().click();
  await page.waitForTimeout(8000);

  // Get the QA test event (should be CANCELLED now)
  const { rows: testEvents } = await dbClient.query("SELECT id, title, status FROM public.events WHERE title LIKE 'QA Test%' ORDER BY created_at DESC LIMIT 1");
  const eventId = testEvents[0].id;
  console.log("Test event:", eventId, testEvents[0].title, testEvents[0].status);

  // Go to admin events page
  await page.goto(`${BASE}/admin/events`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Find the Delete button for our event
  const targetItem = page.locator('div:has-text("QA Test")').filter({ has: page.locator('button:has-text("Delete")') }).first();
  const targetVisible = await targetItem.isVisible().catch(() => false);
  console.log("Target item visible:", targetVisible);

  if (targetVisible) {
    const deleteBtn = targetItem.locator('button:has-text("Delete")').first();
    console.log("Delete button visible:", await deleteBtn.isVisible().catch(() => false));

    await deleteBtn.click();
    await page.waitForTimeout(10000);

    // Check result
    const { rows: after } = await dbClient.query("SELECT id FROM public.events WHERE id = $1", [eventId]);
    console.log("Event exists after delete:", after.length === 0 ? "NO (deleted)" : "YES (not deleted)");
  }

  // Now test re-publish with a different cancelled event
  // First, let's cancel one of the seed events and then re-publish it
  const { rows: pubEvents } = await dbClient.query("SELECT id, title FROM public.events WHERE status = 'PUBLISHED' LIMIT 1");
  if (pubEvents.length > 0) {
    const pubEventId = pubEvents[0].id;
    console.log("\nRe-publish test: Cancelling", pubEvents[0].title);

    // Cancel it via admin page
    await page.goto(`${BASE}/admin/events`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    const cancelTarget = page.locator('div:has-text("' + pubEvents[0].title + '")').filter({ has: page.locator('button:has-text("Cancel")') }).first();
    if (await cancelTarget.isVisible().catch(() => false)) {
      await cancelTarget.locator('button:has-text("Cancel")').first().click();
      await page.waitForTimeout(10000);

      const { rows: afterCancel } = await dbClient.query("SELECT status FROM public.events WHERE id = $1", [pubEventId]);
      console.log("After cancel:", afterCancel[0]?.status);

      if (afterCancel[0]?.status === "CANCELLED") {
        // Now re-publish
        await page.goto(`${BASE}/admin/events`, { waitUntil: "networkidle" });
        await page.waitForTimeout(3000);

        const republishTarget = page.locator('div:has-text("' + pubEvents[0].title + '")').filter({ has: page.locator('button:has-text("Re-publish")') }).first();
        if (await republishTarget.isVisible().catch(() => false)) {
          await republishTarget.locator('button:has-text("Re-publish")').first().click();
          await page.waitForTimeout(10000);

          const { rows: afterRepublish } = await dbClient.query("SELECT status FROM public.events WHERE id = $1", [pubEventId]);
          console.log("After re-publish:", afterRepublish[0]?.status);
        } else {
          console.log("Re-publish button not found");
        }
      }
    }
  }

  await browser.close();
  await dbClient.end();
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
