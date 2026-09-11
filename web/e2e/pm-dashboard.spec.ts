import { test } from "@playwright/test";

const PM_USER = { name: "Sam Chen", role: "PM", title: "Project Manager" };

test("PM dashboard and campaign workflow", async ({ page, context }) => {
  // Sign-in is Firebase in the real app; the e2e run uses the development session
  // (the API runs with ENVIRONMENT=development), set before any page script runs.
  await context.addInitScript(
    ([user]) => {
      window.sessionStorage.setItem("charmquark.user", JSON.stringify(user));
      window.localStorage.setItem("charmquark.onboarded", JSON.stringify([`${(user as { role: string }).role}:${(user as { name: string }).name}`]));
    },
    [PM_USER],
  );

  await page.goto("/home");
  await page.waitForSelector("nav"); // sidebar = signed in
  await page.screenshot({ path: "screenshots/pm_1_dashboard.png", fullPage: true });

  await page.goto("/campaigns");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "screenshots/pm_2_campaigns.png", fullPage: true });

  await page.goto("/schedule");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "screenshots/pm_3_schedule.png", fullPage: true });
});
