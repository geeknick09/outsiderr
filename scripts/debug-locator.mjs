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
  before.forEach(e => console.log(`  ${e.title} (${e.status})`));

  // Go to admin events page
  await page.goto(`${BASE}/admin/events`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Get the HTML structure of the events list
  // Count event cards (div.glass with space-y-3)
  const eventCards = await page.locator("div.glass").count();
  console.log("Glass divs on page:", eventCards);

  // Get all links with event titles
  const allLinks = await page.locator("a").allTextContents();
  console.log("All links (first 10):", allLinks.slice(0, 10));

  // Get all links with event titles
  const eventLinks = await page.locator("a.block.truncate").allTextContents();
  console.log("Event links:", eventLinks);

  // Try to find the QA test event link
  const qaLink = page.locator('a:has-text("QA Test")').first();
  const qaLinkVisible = await qaLink.isVisible().catch(() => false);
  console.log("QA link visible:", qaLinkVisible);

  if (qaLinkVisible) {
    // Get the parent div.glass
    const parentGlass = qaLink.locator('xpath=ancestor::div[contains(@class, "glass")][1]');
    const parentVisible = await parentGlass.isVisible().catch(() => false);
    console.log("Parent glass visible:", parentVisible);

    // Get all buttons within the parent
    const buttonsInParent = await parentGlass.locator("button").allTextContents();
    console.log("Buttons in parent glass:", buttonsInParent);

    // Get the HTML of the parent
    const parentHtml = await parentGlass.innerHTML().catch(() => "");
    console.log("Parent HTML (first 300):", parentHtml.substring(0, 300));
  }

  await browser.close();
  await dbClient.end();
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
