import { test, expect, type APIRequestContext } from "@playwright/test";

// Walks the robot operator Finish flow through the real UI:
//   open Execute -> auto-advance to IN_EXECUTION
//   Done is gated on a variant (checkbox disabled until one is picked)
//   record variant + done + note, and see the per-mission "saved" chip
//   Finish -> recap -> run advances to COLLECTED
//
// Assembly is built via the API (the same endpoints the app calls); the click-through is
// the point of the test.

const PM = { "X-CharmQuark-Role": "PM", "X-CharmQuark-User": "Sam Chen" };
// Only a Fleet Lead may create a mission already cleared for risk (the API enforces it).
const FLEET_LEAD = { "X-CharmQuark-Role": "FLEET_LEAD", "X-CharmQuark-User": "Jordan Lee" };
const ROBOT_OPERATOR = { name: "Alex Rivera", role: "ROBOT_OPERATOR", title: "Field Robot Operator" };

// Build a CONFIRMED run with one ready mission, mirroring CharmQuarkApp/backend/tests/test_lifecycle.py.
// `uniq` keeps operator/lab codes distinct across reruns against a persisted DB.
async function setupConfirmedRun(request: APIRequestContext, uniq: string) {
  // Playwright types `json()` as unknown; every endpoint used here returns an
  // object with an id, so narrow to that rather than sprinkling casts at call sites.
  const j = async <T extends object = { id: string }>(
    r: Awaited<ReturnType<APIRequestContext["post"]>>,
  ): Promise<T> => {
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()) as T;
  };
  const post = (path: string, data: unknown) => request.post(path, { headers: PM, data });

  const campaign = await j(await post("/api/campaigns", { name: `E2E ${uniq}`, campaign_type: "MANIPULATION" }));
  const tg = await j(await post("/api/mission-groups", { campaign_id: campaign.id, name: "G" }));
  const inv = await j(await post("/api/inventory-items", { campaign_id: campaign.id, name: "Pan", kind: "TOOL", status: "AVAILABLE" }));
  await j(await request.post("/api/missions", {
    headers: FLEET_LEAD,
    data: {
      campaign_id: campaign.id, mission_group_id: tg.id, mission_code: "T", name: "Compose",
      instructions_complete: true, risk_level: "LOW", variants: [{ id: "v" }], inventory_item_ids: [inv.id],
    },
  }));
  const p = await j(await post("/api/robots", { robot_code: `P${uniq}`, safety_certified: true, calibration_valid: true, commissioned: true }));
  const o = await j(await post("/api/operators", { operator_code: `M${uniq}`, name: "Alex", code_number: 1 }));
  const loc = await j(await post("/api/labs", { name: `L${uniq}`, capacity: 4, code_number: 1 }));
  const d = await j(await post("/api/sensors", { asset_name: `d${uniq}`, sensor_type: "IMU" }));
  const fleet = await j(await post("/api/sensor-rigs", { campaign_id: campaign.id, name: "F", sensor_ids: [d.id] }));

  const run = await j(await post("/api/runs", { campaign_id: campaign.id, slot_date: "2026-04-20" }));
  await request.patch(`/api/runs/${run.id}`, {
    headers: PM,
    data: {
      mission_scope: "GROUP", mission_group_id: tg.id, robot_id: p.id,
      operator_id: o.id, lab_id: loc.id, sensor_rig_id: fleet.id,
    },
  });
  const confirmed = await j<{ id: string; state: string }>(await request.post(`/api/runs/${run.id}/confirm`, { headers: PM, data: {} }));
  expect(confirmed.state).toBe("CONFIRMED");

  const missions = await (await request.get(`/api/campaigns/${campaign.id}/missions`, { headers: PM })).json();
  const missionId = missions[0].id;
  const detail = await (await request.get(`/api/missions/${missionId}`, { headers: PM })).json();
  const variantCode = detail.variant_options[0].errors[0].code;

  return { runId: run.id as string, missionId: missionId as string, variantCode: variantCode as string };
}

test("robot operator finishes a run end to end", async ({ page, request, context }) => {
  const uniq = Date.now().toString(36);
  const { runId, missionId, variantCode } = await setupConfirmedRun(request, uniq);

  // Sign in as the robot operator and skip first-login onboarding before any page script runs.
  await context.addInitScript(
    ([user]) => {
      window.sessionStorage.setItem("charmquark.user", JSON.stringify(user));
      window.localStorage.setItem("charmquark.onboarded", JSON.stringify([`${(user as { role: string }).role}:${(user as { name: string }).name}`]));
    },
    [ROBOT_OPERATOR],
  );

  await page.goto(`/runs/${runId}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/operator_1_run_page.png', fullPage: true });

  // Entry guard (CQ-EXE-4): a CONFIRMED run is executable.
  const execute = page.getByRole("button", { name: "Execute" });
  await expect(execute).toBeEnabled();
  await execute.click();

  await expect(page.getByRole("heading", { name: "Execute run" })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/operator_2_execute_page.png', fullPage: true });

  const card = page.locator(`#mission-${missionId}`);
  const done = card.locator('input[type="checkbox"]');

  // Guide gate (CQ-EXE-3): Done is disabled until a variant is chosen.
  await expect(done).toBeDisabled();
  await card.locator("select").selectOption(variantCode);
  await expect(done).toBeEnabled();

  await done.check();
  await card.locator("textarea").fill("clean run, recording confirmed");
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/operator_3_filled_form.png', fullPage: true });
  // Blur the note -> immediate save. Blurring the field itself, not clicking the
  // heading, so a floating panel (e.g. the assistant bubble) cannot intercept it.
  await card.locator("textarea").blur();

  // Sync chip (CQ-EXE-2): the entry persisted.
  await expect(card.getByText("saved")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/operator_4_saved.png', fullPage: true });

  // Finish (CQ-EXE-1): open the recap, confirm, land on COLLECTED.
  await page.getByRole("button", { name: "Finish run" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/operator_5_recap.png', fullPage: true });
  const confirmFinish = page.getByRole("button", { name: "Keep working" }).locator("xpath=following-sibling::button");
  await expect(confirmFinish).toBeEnabled();
  await confirmFinish.click();

  await expect(page.getByRole("heading", { name: "Execute run" })).toBeHidden();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/operator_6_finished.png', fullPage: true });

  // The run reached COLLECTED with a complete log entry.
  const after = await (await request.get(`/api/runs/${runId}`, { headers: PM })).json();
  expect(after.state).toBe("COLLECTED");
  expect(after.execution_log[missionId].done).toBe(true);
  expect(after.execution_log[missionId].variant_code).toBe(variantCode);
});
