// Repro: profile save -> "Something went wrong" boundary.
import { chromium } from "playwright";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const supaUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const supaKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();

const r = await fetch(supaUrl + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { apikey: supaKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "dev.user@outsiderr.test", password: "DevTest#1234" }),
});
const j = await r.json();
const session = {
  access_token: j.access_token, refresh_token: j.refresh_token,
  token_type: "bearer", expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: j.user,
};
const cookieVal = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "sb-nlhwnoqgrnbyprksthfi-auth-token", value: cookieVal, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
page.on("response", (res) => { if (res.status() >= 500) errors.push("HTTP" + res.status() + ": " + res.url()); });

await page.goto("http://localhost:3100/profile", { waitUntil: "networkidle" });
console.log("profile loaded:", page.url());

const nameInput = page.locator('input[name="fullName"]').first();
console.log("name input found:", await nameInput.count());
if (await nameInput.count()) await nameInput.fill("Dev User Edited");

await page.locator('button:has-text("Save")').first().click();
await page.waitForTimeout(6000);

console.log("boundary shown:", await page.locator('text="Something went wrong"').count());
const inlineErr = await page.locator(".text-red-500, [role=alert]").first().textContent().catch(() => null);
console.log("inline error:", inlineErr);
console.log("url now:", page.url());
console.log("errors:", errors.slice(0, 8).join("\n") || "none");

await browser.close();
// phase 2: tags + birthdate
const p2 = await ctx.newPage();
await p2.goto("http://localhost:3100/profile", { waitUntil: "networkidle" });
const catBtn = p2.locator('button:has-text("Cyphers")').first();
console.log("cat btn count:", await catBtn.count());
if (await catBtn.count()) { await catBtn.click(); await p2.waitForTimeout(400); }
const dateInput = p2.locator('input[name="birthDate"]');
if (await dateInput.count()) await dateInput.fill("2000-01-15");
await p2.locator('button:has-text("Save")').first().click();
await p2.waitForTimeout(6000);
console.log("P2 boundary:", await p2.locator('text="Something went wrong"').count());
console.log("P2 url:", p2.url());
const p2err = await p2.locator(".text-red-500").first().textContent().catch(()=>null);
console.log("P2 inline:", p2err);
await browser.close();
