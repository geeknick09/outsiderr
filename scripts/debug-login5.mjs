import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const USER_EMAIL = "nickjoe@gmail.com";
const USER_PASSWORD = "123456";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("console", (msg) => {
    console.log(`[console:${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

  console.log("1. Navigating to login...");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // List all buttons
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map((b, i) => ({
      index: i,
      text: (b.textContent || "").trim(),
      type: b.type,
      disabled: b.disabled,
      className: b.className.substring(0, 80),
    }));
  });
  console.log("All buttons:", JSON.stringify(buttons, null, 2));

  // Fill the form
  await page.locator('input[type="email"]').first().fill(USER_EMAIL);
  await page.waitForTimeout(500);
  await page.locator('input[type="password"]').first().fill(USER_PASSWORD);
  await page.waitForTimeout(1000);

  // List buttons again after filling
  const buttonsAfter = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).filter(b =>
      (b.textContent || "").includes("Sign in")
    ).map((b, i) => ({
      index: i,
      text: (b.textContent || "").trim(),
      type: b.type,
      disabled: b.disabled,
    }));
  });
  console.log("\nSign in buttons after fill:", JSON.stringify(buttonsAfter, null, 2));

  // Click the last Sign in button (the submit one, not the tab toggle)
  const signInButtons = page.locator('button:has-text("Sign in")');
  const count = await signInButtons.count();
  console.log(`\nFound ${count} Sign in buttons`);

  // Click the last one
  await signInButtons.last().click();
  console.log("Clicked last Sign in button");

  await page.waitForTimeout(15000);
  console.log(`URL after login: ${page.url()}`);

  await browser.close();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
