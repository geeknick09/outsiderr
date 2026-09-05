import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "official.outsiderr@gmail.com";
const ADMIN_PASSWORD = "123456";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => console.log(`  [console:${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));
  page.on("requestfailed", (req) => console.log(`  [reqfailed] ${req.url()} - ${req.failure()?.errorText}`));

  console.log("Navigating to login page...");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Get the full HTML of the login form area
  const formHtml = await page.evaluate(() => {
    const form = document.querySelector('form') || document.querySelector('.glass');
    return form ? form.outerHTML.substring(0, 2000) : 'no form found';
  });
  console.log("\nForm HTML:");
  console.log(formHtml);

  // Get all buttons on the page
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim().substring(0, 50),
      type: b.type,
      disabled: b.disabled,
    }));
  });
  console.log("\nButtons on page:");
  console.log(JSON.stringify(buttons, null, 2));

  // Fill the form
  console.log("\nFilling form...");
  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await emailInput.fill(ADMIN_EMAIL);
  await passwordInput.fill(ADMIN_PASSWORD);

  // Check button state after filling
  const btnState = await page.evaluate(() => {
    const btn = document.querySelector('button[type="button"]');
    if (!btn) return 'no button';
    return { text: btn.textContent, disabled: btn.disabled, className: btn.className.substring(0, 100) };
  });
  console.log("Button state after fill:", JSON.stringify(btnState));

  // Click and watch what happens
  console.log("\nClicking sign in...");
  const signInBtn = page.locator('button:has-text("Sign in")').first();

  // Listen for navigation
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      console.log(`  [navigated] ${frame.url()}`);
    }
  });

  await signInBtn.click();
  await page.waitForTimeout(15000);

  console.log(`\nFinal URL: ${page.url()}`);

  // Check for any error messages
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
  console.log(`\nPage text:\n${bodyText}`);

  await browser.close();
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
