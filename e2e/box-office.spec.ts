import { test, expect } from "playwright/test";

// Redirects for signed-out visitors are streamed after a server round trip,
// so URL assertions get a longer timeout than the default 5s.
const REDIRECT_TIMEOUT = 20_000;

test.describe("box office and door screens - signed out", () => {
  // KNOWN ISSUE (docs/task.md): the first counter sign-in after a server start fails on the
  // server with "window is not defined" (Leaflet's browser code is in the server bundle), so
  // the form resets without a message. Re-enable when the bundling is fixed.
  test("counter sign-in rejects an unknown phone and keeps the phone number", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/box-office");
    await expect(page.getByRole("heading", { name: "Box office sign-in" })).toBeVisible();

    const phone = page.getByPlaceholder("10-digit phone");
    await phone.fill("9999999999");
    await page.getByPlaceholder("6-digit PIN").fill("000000");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Phone or PIN is incorrect")).toBeVisible({ timeout: 15_000 });
    await expect(phone).toHaveValue("9999999999");
    expect(pageErrors).toEqual([]);
  });

  test("counter PIN field only takes six digits", async ({ page }) => {
    await page.goto("/box-office");
    const pin = page.getByPlaceholder("6-digit PIN");
    await expect(pin).toHaveAttribute("maxlength", "6");
    await expect(pin).toHaveAttribute("pattern", "\\d{6}");
  });

  test("door scanner PIN screen renders", async ({ page }) => {
    await page.goto("/scan");
    await expect(page.getByRole("heading", { name: "Door Scanner" })).toBeVisible();
    await expect(page.getByPlaceholder("000000")).toBeVisible();
  });

  test("admin box office staff page is closed to signed-out visitors", async ({ page }) => {
    await page.goto("/admin/box-office-staff");
    await expect(page).not.toHaveURL(/box-office-staff/, { timeout: REDIRECT_TIMEOUT });
  });

  test("organizer staff page sends signed-out visitors to log in", async ({ page }) => {
    await page.goto("/organizer/staff");
    await expect(page).toHaveURL(/\/login/, { timeout: REDIRECT_TIMEOUT });
  });

  test("organizer scan log is not reachable without signing in", async ({ page }) => {
    const res = await page.goto("/organizer/events/00000000-0000-4000-8000-000000000000/scan-log");
    expect(res?.status()).not.toBe(500);
    await expect(page).toHaveURL(/\/login/, { timeout: REDIRECT_TIMEOUT });
  });
});
