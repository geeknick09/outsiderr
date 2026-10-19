import { test, expect } from "playwright/test";

const EMAIL = "dev.organizer@outsiderr.test";
const PASSWORD = "DevTest#1234";

test("community creation does not hit the error boundary", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

  await page.goto("/communities/create");
  await page.fill('input[name="name"]', `Repro Community ${Date.now() % 100000}`);
  const cat = page.locator('select[name="category"]');
  if (await cat.count()) await cat.selectOption({ index: 1 });
  const submit = page.locator('button[type="submit"]');
  await submit.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(4000);
  const errVisible = await page.locator("text=Something went wrong").count();
  console.log("URL after submit:", page.url(), "| error boundary:", errVisible);
  expect(errVisible).toBe(0);
});
