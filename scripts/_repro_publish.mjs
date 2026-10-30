// Full wizard publish repro - fills every step and captures the real error.
import { chromium } from "playwright";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const supaUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const supaKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();
const r = await fetch(supaUrl + "/auth/v1/token?grant_type=password", {
  method: "POST", headers: { apikey: supaKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "dev.organizer@outsiderr.test", password: "DevTest#1234" }),
});
const j = await r.json();
const session = { access_token: j.access_token, refresh_token: j.refresh_token, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: j.user };

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "sb-nlhwnoqgrnbyprksthfi-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const setField = async (name, val) => {
  const el = page.locator(`input[name="${name}"], textarea[name="${name}"]`).first();
  if (await el.count()) { await el.fill(val); return true; }
  return false;
};

await page.goto("http://localhost:3100/organizer/create", { waitUntil: "networkidle", timeout: 60000 });

// Step 0: event type - default EVENT, continue
await page.locator('button:has-text("Get started")').click();
await page.waitForTimeout(500);

// Step 1: Details
await setField("eventTitle", "Repro Test Event");
await setField("title", "Repro Test Event");
await setField("description", "A test event\nSecond line");
await setField("thingsToKnow", "Know this\nKnow that");
await setField("tags", "test, cypher");
await setField("startsAt", "2030-12-31T18:00");
await setField("endsAt", "2030-12-31T23:00");
await setField("venueName", "Test Venue Hall");
await setField("venueAddress", "1 Test Street");
await setField("googleMapsLink", "https://maps.google.com/?q=test");
// city select
const citySel = page.locator('select[name="city"]').first();
if (await citySel.count()) await citySel.selectOption("KOLKATA");
// category chip
const catBtn = page.locator('button:has-text("Cyphers")').first();
if (await catBtn.count()) await catBtn.click();
await page.waitForTimeout(300);
console.log("details filled");

const cont = async (label = "Continue") => {
  const b = page.locator(`button:has-text("${label}")`).first();
  const dis = await b.isDisabled().catch(() => false);
  console.log(`${label} disabled?`, dis);
  if (!dis) { await b.click(); await page.waitForTimeout(500); }
};
await cont(); // -> Media
await cont(); // -> Extras & contact
await setField("contactEmail", "org@test.com");
await setField("contactPhone", "9876543210");
await cont(); // -> Tickets
await cont(); // -> Staff
await setField("staffName", "Door Guy");
await setField("staffPhone", "9876500000");
await cont(); // -> Review

// terms checkbox
const cb = page.locator('input[type="checkbox"][name="organizerTerms"], input[type="checkbox"]').last();
if (await cb.count()) { if (!(await cb.isChecked())) await cb.check(); }

// publish
await page.locator('button:has-text("Publish event")').first().click();
await page.waitForTimeout(8000);
console.log("url after publish:", page.url());
const err = await page.locator(".text-red-500, [role=alert], p.text-sm.text-red-500").allTextContents();
console.log("errors:", JSON.stringify(err.slice(0, 6)));
await browser.close();
