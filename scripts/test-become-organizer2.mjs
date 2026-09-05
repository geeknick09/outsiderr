import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const USER_EMAIL = "nickjoe@gmail.com";
const USER_PASSWORD = "123456";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[console:error] ${msg.text()}`);
  });
  page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

  // Login first
  console.log("1. Logging in...");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // Fill the form
  await page.locator('input[type="email"]').first().fill(USER_EMAIL);
  await page.waitForTimeout(500);
  await page.locator('input[type="password"]').first().fill(USER_PASSWORD);
  await page.waitForTimeout(1000);

  // Click the Sign in button using Playwright's locator (triggers React onClick)
  // There are 2 "Sign in" buttons: the tab toggle (type=button) and the submit (type=submit)
  // We need the last one (the actual login button)
  const signInBtn = page.locator('button:has-text("Sign in")').last();
  await signInBtn.click();
  console.log("Clicked Sign in button...");

  // Wait for navigation
  await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log(`URL after login: ${page.url()}`);

  const isLoggedIn = !page.url().includes("/login");
  console.log(`Logged in: ${isLoggedIn}`);

  if (!isLoggedIn) {
    console.log("Login failed, aborting.");
    await page.screenshot({ path: "screenshots/login-fail.png" });
    await browser.close();
    return;
  }

  // Navigate to organizer page
  console.log("\n2. Navigating to /organizer...");
  await page.goto(`${BASE}/organizer`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log(`URL: ${page.url()}`);

  // Check if the form is visible
  const formVisible = await page.locator('h1:has-text("Become an Organizer")').isVisible().catch(() => false);
  console.log(`Become organizer form visible: ${formVisible}`);

  if (!formVisible) {
    console.log("Form not visible — user may already be an organizer.");
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 300));
    console.log("Body text:", bodyText);
    await browser.close();
    return;
  }

  // Fill step 0: Profile
  console.log("\n3. Filling step 0 (Profile)...");
  await page.locator('input[placeholder="Basement Collective"]').fill("QA Test Organizer");
  await page.waitForTimeout(300);
  await page.locator('textarea[placeholder*="Tell attendees"]').fill("QA testing the become organizer flow");
  await page.waitForTimeout(300);

  // Click Continue
  await page.locator('button:has-text("Continue")').click();
  await page.waitForTimeout(1000);

  // Fill step 1: PAN
  console.log("4. Filling step 1 (PAN)...");
  const panInput = page.locator('input[placeholder="ABCDE1234F"]');
  await panInput.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await panInput.isVisible().catch(() => false)) {
    await panInput.fill("ABCDE1234F");
    await page.waitForTimeout(300);
    await page.locator('input[placeholder="FIRSTNAME LASTNAME"]').fill("QA TEST");
    await page.waitForTimeout(300);
    await page.locator('button:has-text("Continue")').click();
    await page.waitForTimeout(1000);
  }

  // Step 2: GST (optional) - skip
  console.log("5. Skipping step 2 (GST)...");
  const gstInput = page.locator('input[placeholder="22ABCDE1234F1Z5"]');
  if (await gstInput.isVisible().catch(() => false)) {
    await page.locator('button:has-text("Continue")').click();
    await page.waitForTimeout(1000);
  }

  // Fill step 3: Bank + UPI
  console.log("6. Filling step 3 (Bank + UPI)...");
  const upiInput = page.locator('input[placeholder="yourname@upi"]');
  if (await upiInput.isVisible().catch(() => false)) {
    await upiInput.fill("qatest@upi");
    await page.waitForTimeout(300);
    await page.locator('input[placeholder="Enter account number"]').fill("1234567890");
    await page.waitForTimeout(300);
    await page.locator('input[placeholder="SBIN0001234"]').fill("SBIN0001234");
    await page.waitForTimeout(300);
    await page.locator('input[placeholder="As per bank records"]').fill("QA TEST");
    await page.waitForTimeout(300);
    await page.locator('button:has-text("Continue")').click();
    await page.waitForTimeout(1000);
  }

  // Step 4: Agreement
  console.log("7. Filling step 4 (Agreement)...");
  const checkbox = page.locator('input[type="checkbox"]');
  if (await checkbox.isVisible().catch(() => false)) {
    await checkbox.check();
    await page.waitForTimeout(500);

    // Submit
    console.log("8. Submitting form...");
    const submitBtn = page.locator('button:has-text("Submit & Become an Organizer")');
    await submitBtn.click();

    // Wait for response
    await page.waitForTimeout(15000);
    console.log(`URL after submit: ${page.url()}`);

    // Check for error messages
    const errorEl = page.locator('p:has-text("error"), p:has-text("Error"), p:has-text("failed")').first();
    const errorText = await errorEl.textContent().catch(() => "no error text found");
    console.log(`Error text: ${errorText}`);

    // Check if we navigated to /organizer (success)
    const success = page.url().includes("/organizer") && !page.url().includes("login");
    console.log(`Success: ${success}`);

    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 300));
    console.log(`Body text: ${bodyText?.substring(0, 200)}`);
  } else {
    console.log("Agreement checkbox not found!");
  }

  await page.screenshot({ path: "screenshots/become-organizer-result.png" });
  await browser.close();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
