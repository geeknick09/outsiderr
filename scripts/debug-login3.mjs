import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("console", (msg) => console.log(`  [console:${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));

  console.log("Navigating to login page...");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(10000);

  console.log(`URL: ${page.url()}`);
  console.log(`Title: ${await page.title()}`);

  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) ?? "no body");
  console.log(`\nBody text:\n${bodyText}`);

  const bodyHtml = await page.evaluate(() => document.body?.innerHTML?.substring(0, 3000) ?? "no body");
  console.log(`\nBody HTML (first 3000 chars):\n${bodyHtml}`);

  await page.screenshot({ path: "screenshots/login-debug.png" });

  await browser.close();
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
