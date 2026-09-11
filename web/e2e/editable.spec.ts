import { test, expect } from "@playwright/test";

// Phase 3: records are editable in place, locked fields say why, edits show up
// in Activity, settings render, and pages draw one app shell.

const LEAD = { "X-CharmQuark-Role": "FLEET_LEAD", "X-CharmQuark-User": "Jordan Lee" };
const LEAD_USER = { name: "Jordan Lee", role: "FLEET_LEAD", title: "Fleet Lead" };

test.beforeEach(async ({ context }) => {
  await context.addInitScript(
    ([user]) => {
      window.sessionStorage.setItem("charmquark.user", JSON.stringify(user));
      window.localStorage.setItem("charmquark.onboarded", JSON.stringify([`${(user as { role: string }).role}:${(user as { name: string }).name}`]));
    },
    [LEAD_USER],
  );
});

test("edit a field in place and see it in Activity", async ({ page, request }) => {
  const labs = await (await request.get("/api/labs", { headers: LEAD })).json();
  const lab = labs[0];
  const next = lab.capacity === 7 ? 6 : 7;

  await page.goto(`/labs/${lab.id}`);
  const row = page.locator("dt", { hasText: "Capacity (runs/day)" }).locator("xpath=following-sibling::dd[1]");
  await row.getByRole("button", { name: "Edit" }).click();
  await row.locator("input").fill(String(next));
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText(String(next));

  const activity = page.locator("section", { hasText: "Activity" });
  await expect(activity).toContainText(`capacity: ${lab.capacity} → ${next}`);

  await request.patch(`/api/labs/${lab.id}`, { headers: LEAD, data: { capacity: lab.capacity } });
});

test("derived fields are locked with the reason", async ({ page, request }) => {
  const robots = await (await request.get("/api/robots", { headers: LEAD })).json();
  await page.goto(`/robots/${robots[0].id}`);
  await expect(page.getByText("derived from safety, calibration and commissioning")).toBeVisible();
});

test("settings page lists the rules", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Run effort budget")).toBeVisible();
  await expect(page.getByRole("heading", { name: "API tokens" })).toBeVisible();
});

test("integrations draws a single sidebar", async ({ page }) => {
  await page.goto("/integrations");
  await expect(page.getByRole("heading", { name: /Bring Your Own Key/ })).toBeVisible();
  await expect(page.locator("nav")).toHaveCount(1);
});
