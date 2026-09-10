import { test, expect, type APIRequestContext } from "@playwright/test";

// Walks the robot operator Finish flow through the real UI:
//   open Execute -> auto-advance to IN_EXECUTION
//   Done is gated on a variant (checkbox disabled until one is picked)
//   record variant + done + note, and see the per-task "saved" chip
//   Finish -> recap -> session advances to COLLECTED
//
// Assembly is built via the API (the same endpoints the app calls); the click-through is
// the point of the test.

const PM = { "X-CharmQuark-Role": "PM", "X-CharmQuark-User": "Sam Chen" };
const ROBOT_OPERATOR = { name: "Alex Rivera", role: "ROBOT_OPERATOR", title: "Field Robot Operator" };

// Build a CONFIRMED session with one ready task, mirroring CharmQuarkApp/backend/tests/test_lifecycle.py.
// `uniq` keeps operator/lab codes distinct across reruns against a persisted DB.
async function setupConfirmedSession(request: APIRequestContext, uniq: string) {
  // Playwright types `json()` as unknown; every endpoint used here returns an
  // object with an id, so narrow to that rather than sprinkling casts at call sites.
  const j = async <T extends object = { id: string }>(
    r: Awaited<ReturnType<APIRequestContext["post"]>>,
  ): Promise<T> => {
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()) as T;
  };
  const post = (path: string, data: unknown) => request.post(path, { headers: PM, data });

  const study = await j(await post("/api/studies", { name: `E2E ${uniq}`, study_type: "MANIPULATION" }));
  const tg = await j(await post("/api/task-groups", { study_id: study.id, name: "G" }));
  const inv = await j(await post("/api/inventory-items", { study_id: study.id, name: "Pan", kind: "TOOL", status: "AVAILABLE" }));
  await post("/api/tasks", {
    study_id: study.id, task_group_id: tg.id, task_code: "T", name: "Compose",
    instructions_complete: true, risk_level: "LOW", variants: [{ id: "v" }], inventory_item_ids: [inv.id],
  });
  const p = await j(await post("/api/robots", { robot_code: `P${uniq}`, safety_certified: true, calibration_valid: true, commissioned: true }));
  const o = await j(await post("/api/operators", { operator_code: `M${uniq}`, name: "Alex", code_number: 1 }));
  const loc = await j(await post("/api/labs", { name: `L${uniq}`, capacity: 4, code_number: 1 }));
  const d = await j(await post("/api/devices", { asset_name: `d${uniq}`, device_type: "IPHONE" }));
  const fleet = await j(await post("/api/device-fleets", { study_id: study.id, name: "F", device_ids: [d.id] }));

  const session = await j(await post("/api/sessions", { study_id: study.id, slot_date: "2026-04-20" }));
  await request.patch(`/api/sessions/${session.id}`, {
    headers: PM,
    data: {
      task_scope: "GROUP", task_group_id: tg.id, robot_id: p.id,
      operator_id: o.id, lab_id: loc.id, device_fleet_id: fleet.id,
    },
  });
  const confirmed = await j<{ id: string; state: string }>(await request.post(`/api/sessions/${session.id}/confirm`, { headers: PM, data: {} }));
  expect(confirmed.state).toBe("CONFIRMED");

  const tasks = await (await request.get(`/api/studies/${study.id}/tasks`, { headers: PM })).json();
  const taskId = tasks[0].id;
  const detail = await (await request.get(`/api/tasks/${taskId}`, { headers: PM })).json();
  const variantCode = detail.variant_options[0].errors[0].code;

  return { sessionId: session.id as string, taskId: taskId as string, variantCode: variantCode as string };
}

test("robot operator finishes a session end to end", async ({ page, request, context }) => {
  const uniq = Date.now().toString(36);
  const { sessionId, taskId, variantCode } = await setupConfirmedSession(request, uniq);

  // Sign in as the robot operator and skip first-login onboarding before any page script runs.
  await context.addInitScript(
    ([user]) => {
      window.sessionStorage.setItem("charmquark.user", JSON.stringify(user));
      window.localStorage.setItem("charmquark.onboarded", JSON.stringify([`${(user as { role: string }).role}:${(user as { name: string }).name}`]));
    },
    [ROBOT_OPERATOR],
  );

  await page.goto(`/sessions/${sessionId}`);

  // Entry guard (CQ-EXE-4): a CONFIRMED session is executable.
  const execute = page.getByRole("button", { name: "Execute" });
  await expect(execute).toBeEnabled();
  await execute.click();

  await expect(page.getByRole("heading", { name: "Execute session" })).toBeVisible();

  const card = page.locator(`#task-${taskId}`);
  const done = card.locator('input[type="checkbox"]');

  // Guide gate (CQ-EXE-3): Done is disabled until a variant is chosen.
  await expect(done).toBeDisabled();
  await card.locator("select").selectOption(variantCode);
  await expect(done).toBeEnabled();

  await done.check();
  await card.locator("textarea").fill("clean run, recording confirmed");
  await page.getByRole("heading", { name: "Execute session" }).click(); // blur -> immediate save

  // Sync chip (CQ-EXE-2): the entry persisted.
  await expect(card.getByText("saved")).toBeVisible();

  // Finish (CQ-EXE-1): open the recap, confirm, land on COLLECTED.
  await page.getByRole("button", { name: "Finish session" }).click();
  const confirmFinish = page.getByRole("button", { name: "Keep working" }).locator("xpath=following-sibling::button");
  await expect(confirmFinish).toBeEnabled();
  await confirmFinish.click();

  await expect(page.getByRole("heading", { name: "Execute session" })).toBeHidden();

  // The session reached COLLECTED with a complete log entry.
  const after = await (await request.get(`/api/sessions/${sessionId}`, { headers: PM })).json();
  expect(after.state).toBe("COLLECTED");
  expect(after.execution_log[taskId].done).toBe(true);
  expect(after.execution_log[taskId].variant_code).toBe(variantCode);
});
