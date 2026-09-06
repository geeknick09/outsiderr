import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const TEST_EMAIL = "official.outsiderr@gmail.com";
const TEST_PASSWORD = "123456";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.locator('input[type="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button:has-text("Sign in")').last().click();
  await page.waitForTimeout(8000);

  // Get the most recent QA test event from DB
  const { readFileSync } = await import("fs");
  const { join, dirname } = await import("path");
  const { fileURLToPath } = await import("url");
  const pg = (await import("pg")).default;

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envContent = readFileSync(join(__dirname, "..", ".env"), "utf-8");
  const dbPassword = envContent.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1].trim();
  const dbClient = new pg.Client({
    connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${encodeURIComponent(dbPassword)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await dbClient.connect();
  const { rows } = await dbClient.query("SELECT id FROM public.events WHERE status='PUBLISHED' ORDER BY created_at DESC LIMIT 1");
  await dbClient.end();

  if (rows.length > 0) {
    const eventId = rows[0].id;
    console.log("Using event:", eventId);
    await page.goto(`${BASE}/events/${eventId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);

    const bookBtn = page.locator('button:has-text("Book now")').first();
    const bookVisible = await bookBtn.isVisible().catch(() => false);
    console.log("Book button visible:", bookVisible);

    if (bookVisible) {
      await bookBtn.click();
      await page.waitForTimeout(5000);
      await page.waitForSelector('input[name="utrReference"]', { timeout: 15000 }).catch(() => {});

      // Fill the phone tel input
      const phoneTel = page.locator('input[type="tel"]').first();
      await phoneTel.fill("9876543210");
      await page.waitForTimeout(500);

      // Check hidden input value
      const hiddenPhone = await page.locator('input[name="buyerPhone"]').first().inputValue().catch(() => "NOT FOUND");
      console.log("Hidden phone value:", hiddenPhone);

      // Fill UTR
      await page.locator('input[name="utrReference"]').first().fill("428193756201");
      await page.locator('input[name="buyerName"]').first().fill("QA Tester");

      // Check all form values before submit
      const formValues = await page.evaluate(() => {
        const form = document.querySelector('form');
        if (!form) return "No form found";
        const formData = new FormData(form);
        const obj = {};
        for (const [key, value] of formData.entries()) {
          obj[key] = String(value).substring(0, 50);
        }
        return JSON.stringify(obj, null, 2);
      });
      console.log("Form values:", formValues);
    }
  }

  await browser.close();
})();
