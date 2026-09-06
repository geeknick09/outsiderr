import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const TEST_EMAIL = "official.outsiderr@gmail.com";
const TEST_PASSWORD = "123456";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.locator('input[type="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button:has-text("Sign in")').last().click();
  await page.waitForTimeout(8000);

  // Go to create tab
  await page.goto(`${BASE}/organizer?tab=create`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  // Check what's on the page
  const titleInput = await page.locator('input[name="title"]').first().count();
  const publishBtn = await page.locator('button:has-text("Publish event")').first().count();
  const bodyText = await page.innerText("body").catch(() => "");

  console.log("Title inputs:", titleInput);
  console.log("Publish buttons:", publishBtn);

  // Try filling the form
  if (titleInput > 0) {
    await page.locator('input[name="title"]').first().fill("QA Debug Event");
    await page.locator('select[name="category"]').first().selectOption("CYPHER_BATTLE");
    await page.locator('select[name="city"]').first().selectOption("KOLKATA");

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const futureDateStr = futureDate.toISOString().slice(0, 16);
    await page.locator('input[name="startsAt"]').first().fill(futureDateStr);
    await page.locator('input[name="venueName"]').first().fill("QA Test Venue");
    await page.locator('textarea[name="venueAddress"]').first().fill("123 Test Street");
    await page.locator('textarea[name="description"]').first().fill("QA test event");

    // Check pricing mode
    const flatBtn = page.locator('button:has-text("Flat")').first();
    if (await flatBtn.isVisible().catch(() => false)) {
      await flatBtn.click();
      await page.waitForTimeout(1000);
    }

    const tierPrice = await page.locator('input[name="tierPrice"]').first().count();
    const tierQty = await page.locator('input[name="tierQuantity"]').first().count();
    console.log("Tier price inputs:", tierPrice);
    console.log("Tier qty inputs:", tierQty);

    if (tierPrice > 0) {
      await page.locator('input[name="tierPrice"]').first().fill("300");
      await page.locator('input[name="tierQuantity"]').first().fill("50");
    }

    // Check terms checkbox
    const termsCheckbox = page.locator('input[name="organizerTerms"]').first();
    if (await termsCheckbox.isVisible().catch(() => false)) {
      if (!(await termsCheckbox.isChecked())) await termsCheckbox.check();
      console.log("Terms checkbox checked");
    } else {
      console.log("Terms checkbox NOT found");
    }

    // Check publish button state
    const pubBtn = page.locator('button:has-text("Publish event")').first();
    const pubVisible = await pubBtn.isVisible().catch(() => false);
    const pubDisabled = await pubBtn.isDisabled().catch(() => true);
    console.log("Publish button - visible:", pubVisible, "disabled:", pubDisabled);

    if (pubVisible && !pubDisabled) {
      await pubBtn.click();
      await page.waitForTimeout(10000);
      console.log("After publish, URL:", page.url());
    }

    // Check for error messages on page
    const errorText = await page.locator('.text-red-500').first().innerText().catch(() => "");
    console.log("Error on page:", errorText);
  }

  console.log("Console errors:", errors.slice(0, 5));
  await browser.close();
})();
