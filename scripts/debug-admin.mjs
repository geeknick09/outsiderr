import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD = "123456";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Login as admin
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.locator('button:has-text("Sign in")').last().click();
  await page.waitForTimeout(8000);

  // Go to admin orders
  await page.goto(`${BASE}/admin/orders`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  const text = await page.innerText("body").catch(() => "NO BODY");
  console.log("=== ADMIN ORDERS PAGE ===");
  console.log(text.substring(0, 3000));

  // Check for buttons
  const buttons = await page.locator("button").allInnerTexts().catch(() => []);
  console.log("\n=== BUTTONS ON PAGE ===");
  console.log(buttons);

  // Check for forms
  const forms = await page.locator("form").count().catch(() => 0);
  console.log("\nForms count:", forms);

  await browser.close();
})().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
