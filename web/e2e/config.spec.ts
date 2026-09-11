import { test, expect } from "@playwright/test";

// Phase 6: the configuration bundle can be planned and applied by hand from Settings,
// the same way the cq CLI and agents do it.

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

test("plan an edited bundle on Settings, then apply it", async ({ page, request }) => {
  const bundle = await (await request.get("/api/config/export", { headers: LEAD })).json();
  const lab = bundle.records.labs[0];
  const original = lab.capacity;
  lab.capacity = original === 9 ? 8 : 9;

  await page.goto("/settings");
  await page.getByLabel("Bundle file").setInputFiles({
    name: "edited.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await expect(page.getByText("Plan for edited.json: 0 to create, 1 to update")).toBeVisible();
  await expect(page.getByText(`capacity: ${original} → ${lab.capacity}`)).toBeVisible();

  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Applied: 0 created, 1 updated")).toBeVisible();

  const now = await (await request.get(`/api/labs/${lab.id}`, { headers: LEAD })).json();
  expect(now.capacity).toBe(lab.capacity);
  await request.patch(`/api/labs/${lab.id}`, { headers: LEAD, data: { capacity: original } });
});
