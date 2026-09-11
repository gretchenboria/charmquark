import { test, expect } from "@playwright/test";

const PM = { "X-CharmQuark-Role": "PM", "X-CharmQuark-User": "Sam Chen" };
const PM_USER = { name: "Sam Chen", role: "PM", title: "Project Manager" };

test("PM dashboard and campaign workflow", async ({ page, context }) => {
  // Sign in as PM via UI
  await page.goto("/home");
  await page.getByRole("button", { name: /Sam Chen/i }).click();
  await page.waitForSelector("nav"); // Wait for sidebar to appear
  await page.screenshot({ path: "screenshots/pm_1_dashboard.png", fullPage: true });

  await page.goto("/campaigns");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "screenshots/pm_2_campaigns.png", fullPage: true });

  await page.goto("/schedule");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "screenshots/pm_3_schedule.png", fullPage: true });
});
