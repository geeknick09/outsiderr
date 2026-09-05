import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await context.newPage();

  const results = [];
  function log(name, pass, detail = "") {
    results.push({ name, pass, detail });
    console.log(`${pass ? "✅" : "❌"} | ${name}${detail ? " | " + detail : ""}`);
  }

  // Go to homepage
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Check no horizontal overflow
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  log("No horizontal overflow on mobile", dims.scrollWidth === dims.clientWidth, `scroll=${dims.scrollWidth} client=${dims.clientWidth}`);

  // Test location dropdown
  const locBtn = page.locator('button[aria-haspopup="listbox"]').first();
  await locBtn.click();
  await page.waitForTimeout(1000);

  // Check if dropdown is visible and not clipped
  const dropdown = page.locator('.absolute.right-0.top-full').first();
  const dropdownVisible = await dropdown.isVisible().catch(() => false);
  const dropdownBox = await dropdown.boundingBox().catch(() => null);
  log("Location dropdown visible after click", dropdownVisible, `box=${JSON.stringify(dropdownBox)}`);

  if (dropdownBox) {
    // Check it's not clipped (extends below nav)
    log("Location dropdown extends below nav", dropdownBox.y + dropdownBox.height > 64, `y=${dropdownBox.y} height=${dropdownBox.height}`);

    // Check it's clickable — click a city
    const cityBtn = dropdown.locator('button[role="option"]').first();
    const cityVisible = await cityBtn.isVisible().catch(() => false);
    log("City button in dropdown is visible/clickable", cityVisible, "");

    if (cityVisible) {
      await cityBtn.click();
      await page.waitForTimeout(2000);
      log("City selection click succeeded", true, "");
    }
  }

  // Close dropdown by clicking elsewhere
  await page.mouse.click(10, 300);
  await page.waitForTimeout(1000);

  // Test profile/user menu — need to be logged in
  // First check if there's a login button (not logged in)
  const loginBtn = page.locator('a:has-text("Log in")').first();
  const isLoggedIn = !(await loginBtn.isVisible().catch(() => false));

  if (!isLoggedIn) {
    // Login
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.locator('input[type="email"]').first().fill("official.outsiderr@gmail.com");
    await page.locator('input[type="password"]').first().fill("123456");
    await page.locator('button:has-text("Sign in")').last().click();
    await page.waitForTimeout(8000);

    // Go back to homepage
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
  }

  // Click profile button
  const profileBtn = page.locator('button[aria-haspopup="menu"]').first();
  const profileBtnVisible = await profileBtn.isVisible().catch(() => false);
  log("Profile button visible", profileBtnVisible, "");

  if (profileBtnVisible) {
    await profileBtn.click();
    await page.waitForTimeout(1000);

    // Check if menu is visible and not clipped
    const menu = page.locator('[role="menu"]').first();
    const menuVisible = await menu.isVisible().catch(() => false);
    const menuBox = await menu.boundingBox().catch(() => null);
    log("Profile menu visible after click", menuVisible, `box=${JSON.stringify(menuBox)}`);

    if (menuBox) {
      log("Profile menu extends below nav", menuBox.y + menuBox.height > 64, `y=${menuBox.y} bottom=${menuBox.y + menuBox.height}`);

      // Check if menu items are clickable
      const menuLinks = await menu.locator('a').count();
      log("Profile menu has clickable links", menuLinks > 0, `${menuLinks} links`);

      // Check if logout button is visible
      const logoutBtn = menu.locator('button:has-text("Log out")').first();
      const logoutVisible = await logoutBtn.isVisible().catch(() => false);
      log("Log out button visible in menu", logoutVisible, "");
    }
  }

  // Summary
  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;
  console.log(`\n${"=".repeat(50)}`);
  console.log(`MOBILE DROPDOWN TEST: ${pass} PASS, ${fail} FAIL`);
  console.log(`${"=".repeat(50)}`);

  await browser.close();
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
