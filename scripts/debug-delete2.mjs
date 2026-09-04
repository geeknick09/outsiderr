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

  // Check events before
  const { rows: before } = await dbClient.query("SELECT id, title, status FROM public.events ORDER BY created_at");
  console.log("Events before:");
  before.forEach(e => console.log(`  ${e.id} | ${e.title} | ${e.status}`));

  // Go to admin events page
  await page.goto(`${BASE}/admin/events`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Get all event links and their hrefs
  const eventLinks = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href^="/events/"]');
    return Array.from(links).map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim() }));
  });
  console.log("\nEvent links on page:");
  eventLinks.forEach(l => console.log(`  ${l.href} | ${l.text}`));

  // Get all forms and their buttons
  const forms = await page.evaluate(() => {
    const forms = document.querySelectorAll('form');
    return Array.from(forms).map(f => ({
      action: f.getAttribute('action'),
      buttons: Array.from(f.querySelectorAll('button')).map(b => b.textContent?.trim())
    }));
  });
  console.log("\nForms on page:");
  forms.forEach(f => console.log(`  action=${f.action} | buttons=${f.buttons.join(', ')}`));

  // Now try clicking the Delete button for the QA Test event using evaluate
  const qaEvent = before.find(e => e.title.includes('QA Test'));
  if (qaEvent) {
    console.log(`\nClicking Delete for event: ${qaEvent.id}`);

    // Listen for POST requests
    page.on("request", req => {
      if (req.method() === "POST") console.log(`POST request: ${req.url()}`);
    });

    const deleteClicked = await page.evaluate((eventId) => {
      const links = document.querySelectorAll(`a[href="/events/${eventId}"]`);
      console.log(`Found ${links.length} links for event ${eventId}`);
      for (const link of links) {
        const card = link.closest('.glass');
        if (card) {
          const buttons = card.querySelectorAll('button');
          for (const btn of buttons) {
            if (btn.textContent?.trim() === 'Delete') {
              console.log('Found Delete button, clicking...');
              btn.click();
              return true;
            }
          }
        }
      }
      return false;
    }, qaEvent.id);

    console.log("Delete clicked:", deleteClicked);
    await page.waitForTimeout(10000);

    // Check events after
    const { rows: after } = await dbClient.query("SELECT id, title, status FROM public.events ORDER BY created_at");
    console.log("\nEvents after delete:");
    after.forEach(e => console.log(`  ${e.id} | ${e.title} | ${e.status}`));
    console.log(`Total events after: ${after.length}`);
  }

  await browser.close();
  await dbClient.end();
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
