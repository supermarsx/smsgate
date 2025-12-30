import { test, expect } from "@playwright/test";

test("login page renders and redirects unauthenticated root", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/login");
  await expect(page.locator("text=Auth")).toBeVisible();
});
