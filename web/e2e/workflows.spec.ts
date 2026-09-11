import { test, expect } from "@playwright/test";

// Phase 5: workflow diagrams are bound to CharmQuark services, checked by the API,
// and can start from a guided workflow.

const LEAD = { "X-CharmQuark-Role": "FLEET_LEAD", "X-CharmQuark-User": "Jordan Lee" };
const LEAD_USER = { name: "Jordan Lee", role: "FLEET_LEAD", title: "Fleet Lead" };

// bpmn-js makes the designer the slowest page for `next dev` to compile on first visit.
test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ context }) => {
  await context.addInitScript(
    ([user]) => {
      window.sessionStorage.setItem("charmquark.user", JSON.stringify(user));
      window.localStorage.setItem("charmquark.onboarded", JSON.stringify([`${(user as { role: string }).role}:${(user as { name: string }).name}`]));
    },
    [LEAD_USER],
  );
});

test("a guided workflow links to its diagram, which is bound and clean", async ({ page }) => {
  await page.goto("/workflows");
  await page.getByRole("link", { name: "View diagram" }).first().click();
  await expect(page).toHaveURL(/designer\?id=w1_task_ready/);
  await expect(page.getByText("No problems. 3 steps bound to services.")).toBeVisible();

  await page.locator('g.djs-element[data-element-id="risk"]').click();
  await expect(page.getByLabel("Service")).toHaveValue("assess_risk");
});

test("create a workflow from a guided workflow, break it, and see the check", async ({ page, request }) => {
  const name = `e2e blocker ${Date.now()}`;
  await page.goto("/workflows/designer");
  await page.getByRole("button", { name: "New workflow" }).click();
  await page.getByLabel("Guided workflow", { exact: true }).selectOption("w4_blocker_reassign");
  await page.getByLabel("Name (optional)").fill(name);
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("No problems.")).toBeVisible();

  // Unbinding a service task is a warning the designer shows without saving.
  await page.locator('g.djs-element[data-element-id="reconfirm"]').click();
  await page.getByLabel("Service").selectOption("");
  await expect(page.getByText("Warning: \"Re-confirm run\" is not bound to a service yet")).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  const all = await (await request.get("/api/workflows", { headers: LEAD })).json();
  const mine = all.find((w: { name: string }) => w.name === name);
  expect(mine).toBeTruthy();
  await request.delete(`/api/workflows/${mine.id}`, { headers: LEAD });
});
