import { chromium } from "playwright";
import { readFileSync } from "fs";
import { join } from "path";

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "official.outsiderr@gmail.com";
const ADMIN_PASSWORD = "123456";

const results = [];

function log(name, pass, detail = "") {
  const status = pass ? "PASS" : "FAIL";
  results.push({ name, pass, detail });
  console.log(`${status} | ${name}${detail ? ` | ${detail}` : ""}`);
}

// Load .env manually
const envPath = join(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf-8");
const envVars = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) envVars[match[1]] = match[2];
}

import pg from "pg";
const dbPassword = encodeURIComponent(envVars.SUPABASE_DB_PASSWORD ?? "");
const dbClient = new pg.Client({
  connectionString: `postgresql://postgres.nlhwnoqgrnbyprksthfi:${dbPassword}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
});
dbClient.on("error", (err) => console.error("DB error:", err.message));

async function db(text, params) {
  return dbClient.query(text, params);
}

async function goto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(5000);
      return;
    } catch (err) {
      console.log(`  (retry ${i + 1}/3 for ${url})`);
      await page.waitForTimeout(5000);
    }
  }
}

async function login(page) {
  // Navigate and wait for page to fully load
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // Wait for email input to be visible
  await page.locator('input[type="email"]').first().waitFor({ state: "visible", timeout: 30000 });

  // Fill email
  await page.locator('input[type="email"]').first().fill(ADMIN_EMAIL);
  await page.waitForTimeout(500);

  // Fill password
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.waitForTimeout(1000);

  // Set up spinner watcher before clicking
  let spinnerDetected = false;
  page.locator('svg.animate-spin').first().waitFor({ state: "visible", timeout: 8000 })
    .then(() => { spinnerDetected = true; })
    .catch(() => {});

  let loadingTextDetected = false;
  page.locator('button:has-text("Please wait")').first().waitFor({ state: "visible", timeout: 8000 })
    .then(() => { loadingTextDetected = true; })
    .catch(() => {});

  // Click the last submit button (the Sign in button, not the navbar Log in)
  // Use evaluate to click directly
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button[type="submit"]'));
    // Find the Sign in submit button (not the "Log in" navbar button)
    const signInBtn = buttons.find(b => (b.textContent || "").trim() === "Sign in");
    if (signInBtn && !signInBtn.disabled) {
      signInBtn.click();
    } else if (signInBtn && signInBtn.disabled) {
      // Force click if disabled (shouldn't happen but just in case)
      signInBtn.removeAttribute("disabled");
      signInBtn.click();
    }
  });

  // Wait for spinner to appear
  await page.waitForTimeout(3000);

  return { spinnerDetected, loadingTextDetected };
}

async function main() {
  await dbClient.connect();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`  [browser console error] ${msg.text()}`);
  });
  page.on("pageerror", (err) => console.log(`  [page error] ${err.message}`));

  try {
    // ── Test 1: Login and verify spinner appears ──
    console.log("\n=== Test 1: Login button shows loading spinner ===");
    const { spinnerDetected, loadingTextDetected } = await login(page);
    log("Login button shows spinner on click", spinnerDetected || loadingTextDetected,
      `spinner=${spinnerDetected} text=${loadingTextDetected}`);

    // Wait for login to complete
    await page.waitForTimeout(10000);

    // ── Test 2: Verify we're logged in ──
    console.log("\n=== Test 2: Login succeeded ===");
    const isLoggedIn = !page.url().includes("/login");
    log("Login: user is authenticated", isLoggedIn, `url=${page.url()}`);

    if (!isLoggedIn) {
      // Try again
      const result = await login(page);
      log("Login retry: spinner detected", result.spinnerDetected || result.loadingTextDetected);
      await page.waitForTimeout(10000);
    }

    // ── Test 3: Admin orders page ──
    console.log("\n=== Test 3: Admin orders page ===");
    await goto(page, `${BASE}/admin/orders`);

    if (page.url().includes("/admin/orders")) {
      const approveBtn = page.locator('button:has-text("Approve")').first();
      const rejectBtn = page.locator('button:has-text("Reject")').first();
      const hasApprove = await approveBtn.isVisible().catch(() => false);
      const hasReject = await rejectBtn.isVisible().catch(() => false);
      log("Admin orders: Approve/Reject buttons present", hasApprove || hasReject,
        `approve=${hasApprove} reject=${hasReject}`);

      const submitInForms = await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        let count = 0;
        for (const form of forms) {
          count += form.querySelectorAll('button[type="submit"]').length;
        }
        return count;
      });
      log("Admin orders: submit buttons inside forms", submitInForms > 0, `count=${submitInForms}`);

      // Try clicking Approve and check for spinner
      if (hasApprove) {
        let approveSpinner = false;
        const approveSpinnerWatcher = page.locator('svg.animate-spin').first();
        approveSpinnerWatcher.waitFor({ state: "visible", timeout: 5000 })
          .then(() => { approveSpinner = true; })
          .catch(() => {});

        await approveBtn.click();
        await page.waitForTimeout(3000);
        log("Admin orders: Approve shows spinner when clicked", approveSpinner);
        await page.screenshot({ path: "screenshots/admin-orders-approve.png" });
      }
    } else {
      log("Admin orders: page loaded", false, `url=${page.url()}`);
    }

    // ── Test 4: Admin events page ──
    console.log("\n=== Test 4: Admin events page ===");
    await goto(page, `${BASE}/admin/events`);

    if (page.url().includes("/admin/events")) {
      const featureBtn = page.locator('button:has-text("Feature"), button:has-text("Unfeature")').first();
      const deleteBtn = page.locator('button:has-text("Delete")').first();
      const hasFeature = await featureBtn.isVisible().catch(() => false);
      const hasDelete = await deleteBtn.isVisible().catch(() => false);
      log("Admin events: Feature/Delete buttons present", hasFeature || hasDelete,
        `feature=${hasFeature} delete=${hasDelete}`);

      const submitInForms = await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        let count = 0;
        for (const form of forms) {
          count += form.querySelectorAll('button[type="submit"]').length;
        }
        return count;
      });
      log("Admin events: submit buttons inside forms", submitInForms > 0, `count=${submitInForms}`);
    } else {
      log("Admin events: page loaded", false, `url=${page.url()}`);
    }

    // ── Test 5: Admin clubs page ──
    console.log("\n=== Test 5: Admin clubs page ===");
    await goto(page, `${BASE}/admin/clubs`);

    if (page.url().includes("/admin/clubs")) {
      const approveBtn = page.locator('button:has-text("Approve")').first();
      const unpublishBtn = page.locator('button:has-text("Unpublish")').first();
      const hasApprove = await approveBtn.isVisible().catch(() => false);
      const hasUnpublish = await unpublishBtn.isVisible().catch(() => false);
      log("Admin clubs: Approve/Unpublish buttons present", hasApprove || hasUnpublish,
        `approve=${hasApprove} unpublish=${hasUnpublish}`);
    } else {
      log("Admin clubs: page loaded", false, `url=${page.url()}`);
    }

    // ── Test 6: Admin users page ──
    console.log("\n=== Test 6: Admin users page ===");
    await goto(page, `${BASE}/admin/users`);

    if (page.url().includes("/admin/users")) {
      const toggleBtn = page.locator('button:has-text("Make admin"), button:has-text("Remove admin")').first();
      const hasToggle = await toggleBtn.isVisible().catch(() => false);
      log("Admin users: Make/Remove admin button present", hasToggle);

      const isSubmitInForm = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent?.trim();
          if (text === "Make admin" || text === "Remove admin") {
            return btn.type === "submit" && btn.closest("form") !== null;
          }
        }
        return false;
      });
      log("Admin users: toggle button is submit inside form", isSubmitInForm);
    } else {
      log("Admin users: page loaded", false, `url=${page.url()}`);
    }

    // ── Test 7: Profile page ──
    console.log("\n=== Test 7: Profile page save button ===");
    await goto(page, `${BASE}/profile`);

    if (page.url().includes("/profile") && !page.url().includes("/login")) {
      const saveBtn = page.locator('button:has-text("Save profile")').first();
      const hasSave = await saveBtn.isVisible().catch(() => false);
      log("Profile: Save profile button present", hasSave);

      if (hasSave) {
        let profileSpinner = false;
        const spinnerWatcher = page.locator('button:has-text("Saving") svg.animate-spin').first();
        spinnerWatcher.waitFor({ state: "visible", timeout: 5000 })
          .then(() => { profileSpinner = true; })
          .catch(() => {});

        await saveBtn.click();
        await page.waitForTimeout(3000);
        log("Profile: Save button shows spinner when clicked", profileSpinner);
      }
    } else {
      log("Profile: page loaded", false, `url=${page.url()}`);
    }

    // ── Test 8: Event page Book now button ──
    console.log("\n=== Test 8: Event page Book now button ===");
    const { rows: events } = await db("SELECT id FROM public.events WHERE status = 'PUBLISHED' AND pricing_mode = 'FLAT' LIMIT 1");
    if (events.length > 0) {
      await goto(page, `${BASE}/events/${events[0].id}`);
      const bookBtn = page.locator('button:has-text("Book now"), button:has-text("RSVP now")').first();
      const hasBook = await bookBtn.isVisible().catch(() => false);
      log("Event page: Book now button present", hasBook);

      if (hasBook) {
        let bookSpinner = false;
        const spinnerWatcher = page.locator('button svg.animate-spin').first();
        spinnerWatcher.waitFor({ state: "visible", timeout: 5000 })
          .then(() => { bookSpinner = true; })
          .catch(() => {});

        await bookBtn.click();
        await page.waitForTimeout(3000);
        log("Event page: Book now shows spinner when clicked", bookSpinner);
      }
    }

    // ── Test 9: Organizer page ──
    console.log("\n=== Test 9: Organizer page ===");
    await goto(page, `${BASE}/organizer`);

    if (page.url().includes("/organizer") && !page.url().includes("/login")) {
      const editBtn = page.locator('button:has-text("Edit profile")').first();
      const hasEdit = await editBtn.isVisible().catch(() => false);
      log("Organizer: Edit profile button present", hasEdit);
    } else {
      log("Organizer: page loaded", false, `url=${page.url()}`);
    }

  } catch (err) {
    console.error("Test error:", err.message);
  } finally {
    await browser.close();
    try { await dbClient.end(); } catch {}

    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log(`\n=== LOADING STATE TEST RESULTS: ${passed} PASS, ${failed} FAIL ===`);
  }
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
