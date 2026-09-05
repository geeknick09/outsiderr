import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "official.outsiderr@gmail.com";
const ADMIN_PASSWORD = "123456";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("1. Navigating to login page...");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // Check initial button states
  const initialButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim().substring(0, 30),
      type: b.type,
      disabled: b.disabled,
    }));
  });
  console.log("\n2. Initial buttons:", JSON.stringify(initialButtons, null, 2));

  // Fill using fill()
  console.log("\n3. Filling email with fill()...");
  await page.locator('input[type="email"]').first().fill(ADMIN_EMAIL);
  await page.waitForTimeout(1000);

  // Check button state after email
  const afterEmail = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).filter(b => b.type === "submit").map(b => ({
      text: b.textContent?.trim().substring(0, 30),
      disabled: b.disabled,
    }));
  });
  console.log("After email fill:", JSON.stringify(afterEmail));

  console.log("\n4. Filling password with fill()...");
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.waitForTimeout(1000);

  // Check button state after password
  const afterPassword = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).filter(b => b.type === "submit").map(b => ({
      text: b.textContent?.trim().substring(0, 30),
      disabled: b.disabled,
    }));
  });
  console.log("After password fill:", JSON.stringify(afterPassword));

  // Check input values
  const inputValues = await page.evaluate(() => {
    return {
      email: document.querySelector('input[type="email"]')?.value,
      password: document.querySelector('input[type="password"]')?.value,
    };
  });
  console.log("Input values:", JSON.stringify(inputValues));

  // Try clicking the submit button via evaluate
  console.log("\n5. Clicking submit button via JS...");
  const clickResult = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button[type="submit"]');
    for (const btn of buttons) {
      if (btn.textContent && btn.textContent.includes("Sign in")) {
        if (btn.disabled) return { clicked: false, reason: "button is disabled" };
        btn.click();
        return { clicked: true, text: btn.textContent.trim() };
      }
    }
    return { clicked: false, reason: "button not found" };
  });
  console.log("Click result:", JSON.stringify(clickResult));

  await page.waitForTimeout(5000);
  console.log(`\n6. URL after click: ${page.url()}`);

  // Check for spinners
  const spinners = await page.evaluate(() => {
    return document.querySelectorAll('svg.animate-spin').length;
  });
  console.log("Spinners on page:", spinners);

  await browser.close();
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
