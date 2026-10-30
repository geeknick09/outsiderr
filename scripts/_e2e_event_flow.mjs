// E2E: create event -> save draft -> reopen -> publish -> verify.
import { chromium } from "playwright";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const supaUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const supaKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();
const svcKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const { createClient } = await import("@supabase/supabase-js");
const svc = createClient(supaUrl, svcKey, { auth: { persistSession: false } });

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
const log = (...a) => console.log("[e2e]", ...a);

const fill = async (name, val) => {
  const el = page.locator(`input[name="${name}"]:visible, textarea[name="${name}"]:visible, select[name="${name}"]:visible`).first();
  if (await el.count()) { await el.fill(val); return true; }
  log("missing field:", name); return false;
};
const cont = async () => {
  const b = page.locator('button:has-text("Continue")').first();
  if (await b.isDisabled()) { log("CONTINUE DISABLED"); return false; }
  await b.click(); await page.waitForTimeout(700); return true;
};

await page.goto("http://localhost:3100/organizer/create", { waitUntil: "networkidle", timeout: 90000 });
await page.locator('button:has-text("Get started")').click();
await page.waitForTimeout(600);
log("step: details");

await fill("title", "E2E Lifecycle Test");
await fill("description", "E2E test description");
await fill("thingsToKnow", "Bring ID");
await fill("startsAt", "2030-11-20T18:00");
await fill("endsAt", "2030-11-20T22:00");
await fill("venueName", "E2E Venue");
await fill("venueAddress", "1 E2E Street");
await fill("googleMapsLink", "https://maps.google.com/?q=kolkata");
const citySel = page.locator('select[name="city"]').first();
if (await citySel.count()) await citySel.selectOption("KOLKATA");
// category + tag chips
const cat = page.locator('button:has-text("Cyphers"), button:has-text("Jams")').first();
if (await cat.count()) { await cat.click(); await page.waitForTimeout(300); }
const tag = page.locator('button:has-text("Battle"), button:has-text("Cypher")').first();
if (await tag.count()) { await tag.click(); }
log("details filled");

await cont(); log("-> media"); await cont(); log("-> extras");
await fill("contactEmail", "e2e@test.com");
await fill("contactPhone", "9876500000");
await cont(); log("-> tickets");
await fill("tierName", "E2E GA");
await fill("tierPrice", "199");
await fill("tierQuantity", "50");
await cont(); log("-> staff");
const addStaff = page.locator('button:has-text("Add staff member")');
if (await addStaff.count()) { await addStaff.click(); await page.waitForTimeout(400); }
await fill("staffName", "E2E Scanner");
await fill("staffPhone", "9876512345");
const promo = page.locator('select[name="promoterMode"]');
if (await promo.count()) await promo.selectOption("LINK");
await cont(); log("-> review");

const cb = page.locator('input[name="organizerTerms"]');
if (await cb.count() && !(await cb.isChecked())) await cb.check();

// SAVE AS DRAFT - opens confirm modal first
await page.locator('button:has-text("Save as draft")').first().click();
await page.waitForTimeout(800);
await page.locator('button:has-text("Save draft")').first().click();
await page.waitForTimeout(9000);
log("after draft save url:", page.url());
const draftErr = await page.locator("p.text-red-500, .text-red-500").allTextContents();
log("draft errors:", JSON.stringify(draftErr.slice(0, 4)));

const { data: draft } = await svc.from("events").select("id,status").eq("title", "E2E Lifecycle Test").order("created_at", { ascending: false }).limit(1).maybeSingle();
log("draft in DB:", JSON.stringify(draft));

// REOPEN DRAFT
if (draft?.id) {
  await page.goto(`http://localhost:3100/organizer/events/${draft.id}`, { waitUntil: "networkidle", timeout: 90000 });
  const boundary = await page.locator('text=Could not load event').count();
  log("manage page boundary:", boundary > 0);
  if (!boundary) {
    // navigate to review step via step pills if present
    await page.locator('button:has-text("Staff"), button:has-text("Review")').last().click().catch(() => {});
    await page.waitForTimeout(600);
    // staff restored?
    const staffVal = await page.locator('input[name="staffName"]').first().inputValue().catch(() => "(none)");
    log("restored staffName:", staffVal);
    const cb2 = page.locator('input[name="organizerTerms"]');
    if (await cb2.count() && !(await cb2.isChecked())) await cb2.check();
    // publish
    const pub = page.locator('button:has-text("Publish event")').first();
    if (await pub.isDisabled()) log("PUBLISH DISABLED");
    else {
      await pub.click();
      await page.waitForTimeout(9000);
      log("after publish url:", page.url());
      const pubErr = await page.locator("p.text-red-500, .text-red-500").allTextContents();
      log("publish errors:", JSON.stringify(pubErr.slice(0, 4)));
    }
    const { data: ev } = await svc.from("events").select("status").eq("id", draft.id).single();
    log("event status:", ev?.status);
    const { data: staff } = await svc.from("event_staff").select("display_name,phone").eq("event_id", draft.id);
    log("event_staff:", JSON.stringify(staff));
  }
}
await browser.close();
