import { test, expect } from "playwright/test";

// Redirects for signed-out visitors are streamed after a server round trip,
// so URL assertions get a longer timeout than the default 5s.
const REDIRECT_TIMEOUT = 20_000;

test.describe("box office and door screens - signed out", () => {
  test("counter sign-in rejects an unknown phone and keeps the identifier", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/box-office");
    await expect(page.getByRole("heading", { name: "Box office sign-in" })).toBeVisible();
    // Let hydration finish before typing - a pre-hydration submit navigates natively.
    await page.waitForLoadState("networkidle");

    const identifier = page.getByPlaceholder("Phone or email");
    await identifier.fill("9999999999");
    await page.getByPlaceholder("Password").fill("wrongpass");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Phone/email or password is incorrect")).toBeVisible({ timeout: 15_000 });
    await expect(identifier).toHaveValue("9999999999");
    expect(pageErrors).toEqual([]);
  });

  test("counter sign-in has identifier + password fields", async ({ page }) => {
    await page.goto("/box-office");
    await expect(page.getByPlaceholder("Phone or email")).toBeVisible();
    const password = page.getByPlaceholder("Password");
    await expect(password).toBeVisible();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("door scanner staff sign-in renders", async ({ page }) => {
    await page.goto("/scan");
    await expect(page.getByRole("heading", { name: "Door Scanner" })).toBeVisible();
    await expect(page.getByPlaceholder("10-digit phone or email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
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
