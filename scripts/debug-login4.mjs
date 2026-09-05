import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "official.outsiderr@gmail.com";
const ADMIN_PASSWORD = "123456";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("1. Navigating to login page...");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // Fill the form
  await page.locator('input[type="email"]').first().fill(ADMIN_EMAIL);
  await page.waitForTimeout(500);
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.waitForTimeout(1000);

  // Get detailed button info
  const buttonInfo = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button[type="submit"]');
    return Array.from(buttons).map((btn, i) => ({
      index: i,
      textContent: btn.textContent,
      trimmed: btn.textContent?.trim(),
      disabled: btn.disabled,
      disabledAttr: btn.getAttribute('disabled'),
      innerHTML: btn.innerHTML.substring(0, 200),
    }));
  });
  console.log("\n2. Submit buttons detail:");
  console.log(JSON.stringify(buttonInfo, null, 2));

  // Try clicking the last submit button directly
  console.log("\n3. Clicking last submit button...");
  const clickResult = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button[type="submit"]');
    const lastBtn = buttons[buttons.length - 1];
    if (!lastBtn) return { error: "no submit buttons found" };
    const info = {
      text: lastBtn.textContent?.trim(),
      disabled: lastBtn.disabled,
    };
    if (lastBtn.disabled) return { ...info, error: "button is disabled" };
    lastBtn.click();
    return { ...info, clicked: true };
  });
  console.log("Click result:", JSON.stringify(clickResult));

  await page.waitForTimeout(3000);
  console.log(`\n4. URL after click: ${page.url()}`);

  // Check for spinners
  const spinners = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('svg.animate-spin')).length;
  });
  console.log("Spinners on page:", spinners);

  // Check all buttons for loading text
  const loadingButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).filter(b => 
      b.textContent?.includes("Please wait") || b.textContent?.includes("Saving") || b.textContent?.includes("Submitting")
    ).map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }));
  });
  console.log("Loading buttons:", JSON.stringify(loadingButtons));

  await browser.close();
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
