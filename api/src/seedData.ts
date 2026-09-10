/**
 * Canonical dummy dataset.
 *
 * Every value here is fictional. This is the dataset a fresh CharmQuark install
 * starts from and the one `wrangler d1 execute --file=db/seed/0001_dummy.sql`
 * loads; `db/seed/0001_dummy.sql` is generated from this module, so edit here
 * and regenerate rather than editing the two separately.
 *
 * Shape: 3 labs, 11 robots across 3 platform families, 14 sensors in 3 rigs,
 * 5 operators, one active perception program with a task catalog, and a handful
 * of runs spread across the pipeline states.
 */

// Stable ids so the seed is idempotent and re-runnable.
const ID = {
  study: "11111111-1111-4111-8111-000000000001",
  groupNav: "22222222-2222-4222-8222-000000000001",
  groupManip: "22222222-2222-4222-8222-000000000002",
  groupDock: "22222222-2222-4222-8222-000000000003",
  fleetStd: "33333333-3333-4333-8333-000000000001",
  fleetManip: "33333333-3333-4333-8333-000000000002",
  fleetOutdoor: "33333333-3333-4333-8333-000000000003",
} as const;

const t = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`;
const r = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;
const o = (n: number) => `66666666-6666-4666-8666-${String(n).padStart(12, "0")}`;
const l = (n: number) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;
const d = (n: number) => `88888888-8888-4888-8888-${String(n).padStart(12, "0")}`;
const s = (n: number) => `99999999-9999-4999-8999-${String(n).padStart(12, "0")}`;
const u = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const i = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, "0")}`;

const q = (v: string | number | null): string =>
  v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replaceAll("'", "''")}'`;

/** A variant with one correct spec and one injected-error spec. */
const variants = (name: string, errorLabel: string): string =>
  JSON.stringify([
    { id: "v1", name, correct: { id: "e0", label: "Nominal", reps: null },
      errors: [{ id: "e1", label: errorLabel, errorClass: "INDUCED", reps: null }] },
  ]);

const steps = (...lines: string[]): string =>
  JSON.stringify(lines.map((text, n) => ({ step: n + 1, text })));

// ---------------------------------------------------------------- rows
const USERS: [string, string, string, string, string][] = [
  [u(1), "s.okafor", "Sade Okafor", "s.okafor@example.invalid", "PM"],
  [u(2), "r.delacroix", "Remy Delacroix", "r.delacroix@example.invalid", "FLEET_LEAD"],
  [u(3), "m.tanaka", "Mio Tanaka", "m.tanaka@example.invalid", "ROBOT_OPERATOR"],
];

const LABS: [string, string, string, number, number, number][] = [
  [l(1), "Highbay 1", "LAB_BAY", 1, 4, 1],
  [l(2), "Mock Warehouse", "LAB_BAY", 1, 4, 2],
  [l(3), "Outdoor Test Pad", "OUTDOORS", 1, 3, 3],
];

const OPERATORS: [string, string, string, string, number, number][] = [
  [o(1), "OP-01", "Mio Tanaka", "ROBOT_OPERATOR", 1, 1],
  [o(2), "OP-02", "Ivo Bergqvist", "ROBOT_OPERATOR", 1, 2],
  [o(3), "OP-03", "Priya Raman", "QA_REVIEWER", 1, 3],
  [o(4), "OP-04", "Remy Delacroix", "FIELD_LEAD", 1, 4],
  [o(5), "OP-05", "No'a Feldman", "DATA_ENGINEER", 1, 5],
];

/** [id, code, name, platform, serial, status, safety, calib, commissioned, standby] */
const ROBOTS: [string, string, string, string, string, string, number, number, number, number][] = [
  [r(1),  "RB-Q-001", "Sable 01", "Sable Quadruped",     "SBL-1001", "ACTIVE",      1, 1, 1, 0],
  [r(2),  "RB-Q-002", "Sable 02", "Sable Quadruped",     "SBL-1002", "ACTIVE",      1, 1, 1, 0],
  [r(3),  "RB-Q-003", "Sable 03", "Sable Quadruped",     "SBL-1003", "ACTIVE",      1, 0, 1, 0],
  [r(4),  "RB-Q-004", "Sable 04", "Sable Quadruped",     "SBL-1004", "POOL",        1, 1, 1, 1],
  [r(5),  "RB-M-001", "Verge 01", "Verge Mobile Manip",  "VRG-2001", "ACTIVE",      1, 1, 1, 0],
  [r(6),  "RB-M-002", "Verge 02", "Verge Mobile Manip",  "VRG-2002", "ACTIVE",      1, 1, 1, 0],
  [r(7),  "RB-M-003", "Verge 03", "Verge Mobile Manip",  "VRG-2003", "MAINTENANCE", 0, 0, 1, 0],
  [r(8),  "RB-M-004", "Verge 04", "Verge Mobile Manip",  "VRG-2004", "POOL",        1, 1, 1, 1],
  [r(9),  "RB-A-001", "Trundle 01", "Trundle AMR",       "TRD-3001", "ACTIVE",      1, 1, 1, 0],
  [r(10), "RB-A-002", "Trundle 02", "Trundle AMR",       "TRD-3002", "ACTIVE",      1, 1, 0, 0],
  [r(11), "RB-A-003", "Trundle 03", "Trundle AMR",       "TRD-3003", "RETIRED",     0, 0, 0, 0],
];

/** [id, asset_name, device_type, status] — the sensor payloads mounted on robots. */
const DEVICES: [string, string, string, string][] = [
  [d(1),  "LIDAR-32-A",    "LIDAR_3D",     "OPERATIONAL"],
  [d(2),  "LIDAR-32-B",    "LIDAR_3D",     "OPERATIONAL"],
  [d(3),  "LIDAR-32-C",    "LIDAR_3D",     "MAINTENANCE"],
  [d(4),  "STEREO-FRONT-A","STEREO_CAMERA","OPERATIONAL"],
  [d(5),  "STEREO-FRONT-B","STEREO_CAMERA","OPERATIONAL"],
  [d(6),  "RGBD-WRIST-A",  "DEPTH_CAMERA", "OPERATIONAL"],
  [d(7),  "RGBD-WRIST-B",  "DEPTH_CAMERA", "DEGRADED"],
  [d(8),  "IMU-9DOF-A",    "IMU",          "OPERATIONAL"],
  [d(9),  "IMU-9DOF-B",    "IMU",          "OPERATIONAL"],
  [d(10), "GNSS-RTK-A",    "GNSS_RTK",     "OPERATIONAL"],
  [d(11), "THERMAL-640-A", "THERMAL",      "OPERATIONAL"],
  [d(12), "FT-6AXIS-A",    "FORCE_TORQUE", "OPERATIONAL"],
  [d(13), "MICARRAY-4-A",  "AUDIO_ARRAY",  "OPERATIONAL"],
  [d(14), "ENCODER-SET-A", "ENCODER",      "OPERATIONAL"],
];

const FLEETS: [string, string, string[]][] = [
  [ID.fleetStd,     "Standard Perception Rig", [d(1), d(4), d(8), d(14)]],
  [ID.fleetManip,   "Manipulation Rig",        [d(2), d(5), d(6), d(9), d(12)]],
  [ID.fleetOutdoor, "Outdoor RTK Rig",         [d(2), d(5), d(9), d(10), d(11)]],
];

const INVENTORY: [string, string, string, number, string, string][] = [
  [i(1), "Calibration target (checkerboard A3)", "TOOL",       4, "ea",   "AVAILABLE"],
  [i(2), "AprilTag board set",                   "TOOL",       6, "ea",   "AVAILABLE"],
  [i(3), "Pallet, euro (mock load)",             "CONSUMABLE", 12, "ea",  "AVAILABLE"],
  [i(4), "Tote, plastic 600x400",                "CONSUMABLE", 30, "ea",  "AVAILABLE"],
  [i(5), "Battery pack, spare",                  "SPARE_PART", 8, "ea",   "AVAILABLE"],
  [i(6), "Gripper pad set",                      "SPARE_PART", 2, "set",  "ORDERED"],
  [i(7), "Wrist camera mount",                   "PAYLOAD",    3, "ea",   "AVAILABLE"],
  [i(8), "RTK base station",                     "PAYLOAD",    1, "ea",   "AVAILABLE"],
];

/**
 * [id, code, name, group_id, group_label, duration, reps_target, reps_actual,
 *  review, risk, legal, instructions_complete, variants, steps, inventory]
 */
const TASKS: [string, string, string, string, string, string, number, number, string, string, string, number, string, string, string[]][] = [
  [t(1), "T1", "Traverse aisle, nominal lighting", ID.groupNav, "Navigation", "SHORT", 12, 4,
    "APPROVED", "LOW", "NONE", 1, variants("Nominal lighting", "Sudden light change"),
    steps("Place the robot at aisle entry marker A.", "Command traverse to marker B.", "Hold at B for 5 s."), [i(2)]],
  [t(2), "T2", "Traverse aisle, low light", ID.groupNav, "Navigation", "SHORT", 12, 12,
    "APPROVED", "LOW", "NONE", 1, variants("Low light", "Strobe interference"),
    steps("Set bay lighting to 20 lux.", "Command traverse from A to B."), [i(2)]],
  [t(3), "T3", "Dynamic obstacle avoidance", ID.groupNav, "Navigation", "MEDIUM", 8, 2,
    "APPROVED", "POTENTIAL", "APPROVED", 1, variants("Single crossing obstacle", "Obstacle stops mid-path"),
    steps("Position the obstacle cart at the midpoint.", "Command traverse; cross the path at 1 m/s."), [i(3)]],
  [t(4), "T4", "Pallet approach and scan", ID.groupNav, "Navigation", "MEDIUM", 6, 0,
    "APPROVED", "LOW", "NONE", 1, variants("Square approach", "Skewed pallet 15deg"),
    steps("Place a euro pallet at the marked pose.", "Command approach and full scan sweep."), [i(3)]],
  [t(5), "T5", "Tote pick from shelf, eye level", ID.groupManip, "Manipulation", "MEDIUM", 10, 3,
    "APPROVED", "POTENTIAL", "APPROVED", 1, variants("Rigid tote", "Overfilled tote"),
    steps("Load the tote at shelf level 3.", "Command pick.", "Command place on the cart."), [i(4), i(6)]],
  [t(6), "T6", "Tote pick from floor", ID.groupManip, "Manipulation", "LONG", 6, 1,
    "APPROVED", "POTENTIAL", "APPROVED", 1, variants("Clear floor", "Adjacent clutter"),
    steps("Place the tote at floor marker C.", "Command pick from floor.", "Return to home pose."), [i(4)]],
  [t(7), "T7", "Handover to operator", ID.groupManip, "Manipulation", "MEDIUM", 8, 0,
    "PENDING_PM_REVIEW", "HIGH", "PENDING", 1, variants("Standing handover", "Operator withdraws hand"),
    steps("Operator stands at the marked handover pose.", "Command handover.", "Operator receives the tote."), [i(4)]],
  [t(8), "T8", "Dock and charge", ID.groupDock, "Docking", "SHORT", 10, 10,
    "APPROVED", "LOW", "NONE", 1, variants("Straight approach", "Offset approach 20cm"),
    steps("Command return to dock.", "Confirm charge contact within 30 s."), [i(5)]],
  [t(9), "T9", "Undock under load", ID.groupDock, "Docking", "SHORT", 8, 0,
    "APPROVED", "LOW", "NONE", 0, variants("Empty", "Loaded tote"),
    steps("Command undock.", "Traverse 2 m forward."), [i(4), i(5)]],
  [t(10), "T10", "Outdoor pad traverse, RTK fix", ID.groupNav, "Navigation", "LONG", 4, 0,
    "APPROVED", "POTENTIAL", "NONE", 1, variants("Clear sky", "Partial occlusion"),
    steps("Confirm RTK fix before start.", "Command the 40 m pad loop."), [i(8)]],
];

/**
 * [id, slot_date, slot_time, state, task_ids, robot, operator, lab, fleet, seq, code]
 *
 * Task sets are SINGLE-scope and deliberately sized to the 4-unit effort budget
 * (1 long = 2 medium = 4 short), so a row marked READY genuinely passes every
 * readiness gate. s7 keeps one real blocker (T9 has no instructions) so the
 * blocked-session path is visible out of the box.
 */
const SESSIONS: [string, string, string, string, string[], string, string, string, string, number, string | null][] = [
  [s(1), "2026-09-07", "09:00", "DONE",       [t(1), t(2)],  r(1), o(1), l(1), ID.fleetStd,   1, "26W37m1L1S1"],
  [s(2), "2026-09-07", "11:00", "VALIDATED",  [t(8), t(2)],  r(9), o(2), l(2), ID.fleetStd,   1, "26W37m2L2S1"],
  [s(3), "2026-09-08", "09:00", "MANUAL_QA",  [t(5)],        r(5), o(1), l(2), ID.fleetManip, 2, "26W37m1L2S2"],
  [s(4), "2026-09-09", "13:00", "COLLECTED",  [t(3), t(4)],  r(2), o(2), l(1), ID.fleetStd,   2, "26W37m2L1S2"],
  [s(5), "2026-09-11", "09:00", "CONFIRMED",  [t(6)],        r(6), o(1), l(2), ID.fleetManip, 3, "26W37m1L2S3"],
  [s(6), "2026-09-14", "11:00", "READY",      [t(1), t(3)],  r(1), o(2), l(1), ID.fleetStd,   3, null],
  [s(7), "2026-09-15", "09:00", "ASSEMBLING", [t(9)],        r(9), o(1), l(2), ID.fleetStd,   4, null],
];

// ---------------------------------------------------------------- SQL
/** The full seed as ordered SQL statements. Deletes first, so it is re-runnable. */
export function seedStatements(): string[] {
  const out: string[] = [];

  // Wipe in FK-safe order.
  for (const table of [
    "qa_pipeline_runs", "task_executions", "sessions", "task_instruction_versions",
    "tasks", "task_groups", "device_fleets", "inventory_items", "lab_blackouts",
    "documents", "workflows", "studies", "robots", "operators", "labs", "devices", "users",
  ]) {
    out.push(`DELETE FROM ${table}`);
  }

  for (const [id, subject, name, email, role] of USERS) {
    out.push(`INSERT INTO users (id, subject, name, email, role) VALUES (${q(id)}, ${q(subject)}, ${q(name)}, ${q(email)}, ${q(role)})`);
  }
  for (const [id, name, type, avail, cap, code] of LABS) {
    out.push(`INSERT INTO labs (id, name, type, is_available, capacity, code_number) VALUES (${q(id)}, ${q(name)}, ${q(type)}, ${avail}, ${cap}, ${code})`);
  }
  for (const [id, code, name, role, active, num] of OPERATORS) {
    out.push(`INSERT INTO operators (id, operator_code, name, role, is_active, code_number) VALUES (${q(id)}, ${q(code)}, ${q(name)}, ${q(role)}, ${active}, ${num})`);
  }
  for (const [id, code, name, platform, serial, status, safe, cal, comm, standby] of ROBOTS) {
    const commDate = comm ? "'2026-06-01'" : "NULL";
    out.push(`INSERT INTO robots (id, robot_code, name, platform, serial_number, status, safety_certified, calibration_valid, commissioned, commissioned_date, is_standby) VALUES (${q(id)}, ${q(code)}, ${q(name)}, ${q(platform)}, ${q(serial)}, ${q(status)}, ${safe}, ${cal}, ${comm}, ${commDate}, ${standby})`);
  }
  for (const [id, asset, type, status] of DEVICES) {
    out.push(`INSERT INTO devices (id, asset_name, device_type, status) VALUES (${q(id)}, ${q(asset)}, ${q(type)}, ${q(status)})`);
  }

  out.push(`INSERT INTO studies (id, name, study_type, target_n, status, default_device_fleet_id) VALUES (${q(ID.study)}, 'Warehouse Perception Baseline', 'PERCEPTION', 60, 'ACTIVE', ${q(ID.fleetStd)})`);

  const groups: [string, string, number][] = [
    [ID.groupNav, "Navigation", 1],
    [ID.groupManip, "Manipulation", 2],
    [ID.groupDock, "Docking", 3],
  ];
  for (const [id, name, order] of groups) {
    out.push(`INSERT INTO task_groups (id, study_id, name, "order") VALUES (${q(id)}, ${q(ID.study)}, ${q(name)}, ${order})`);
  }
  for (const [id, name, deviceIds] of FLEETS) {
    out.push(`INSERT INTO device_fleets (id, study_id, name, device_ids) VALUES (${q(id)}, ${q(ID.study)}, ${q(name)}, ${q(JSON.stringify(deviceIds))})`);
  }
  for (const [id, name, kind, qty, unit, status] of INVENTORY) {
    out.push(`INSERT INTO inventory_items (id, study_id, name, kind, quantity, unit, status) VALUES (${q(id)}, ${q(ID.study)}, ${q(name)}, ${q(kind)}, ${qty}, ${q(unit)}, ${q(status)})`);
  }
  for (const [id, code, name, groupId, groupLabel, dur, target, actual, review, risk, legal, done, vars, ins, inv] of TASKS) {
    const sched = actual >= target ? "RECORDED" : "AVAILABLE";
    out.push(`INSERT INTO tasks (id, study_id, task_group_id, task_code, name, "group", status, review_status, duration_type, reps_target, reps_actual, schedule_status, instructions_complete, risk_level, legal_approval, variants, inventory_item_ids, instructions) VALUES (${q(id)}, ${q(ID.study)}, ${q(groupId)}, ${q(code)}, ${q(name)}, ${q(groupLabel)}, 'COLLECTABLE', ${q(review)}, ${q(dur)}, ${target}, ${actual}, ${q(sched)}, ${done}, ${q(risk)}, ${q(legal)}, ${q(vars)}, ${q(JSON.stringify(inv))}, ${q(ins)})`);
  }
  for (const [id, date, time, state, taskIds, robot, operator, lab, fleet, seq, code] of SESSIONS) {
    const prov = `S-${date.replaceAll("-", "")}`;
    const labName = LABS.find((x) => x[0] === lab)?.[1] ?? "";
    const rigName = FLEETS.find((x) => x[0] === fleet)?.[1] ?? "";
    // One planned repetition per task keeps the seed's rep plan explicit.
    const reps = Object.fromEntries(taskIds.map((tid) => [tid, 1]));
    out.push(`INSERT INTO sessions (id, study_id, slot_date, slot_time, state, task_scope, task_ids, task_reps, robot_id, operator_id, lab_id, device_fleet_id, session_seq, provisional_code, encoded_code, payload, session_lab) VALUES (${q(id)}, ${q(ID.study)}, ${q(date)}, ${q(time)}, ${q(state)}, 'SINGLE', ${q(JSON.stringify(taskIds))}, ${q(JSON.stringify(reps))}, ${q(robot)}, ${q(operator)}, ${q(lab)}, ${q(fleet)}, ${seq}, ${q(prov)}, ${code ? q(code) : "NULL"}, ${q(rigName)}, ${q(labName)})`);
  }

  return out;
}

export const SEED_SUMMARY = {
  labs: LABS.length,
  robots: ROBOTS.length,
  standby: ROBOTS.filter((x) => x[9] === 1).length,
  operators: OPERATORS.length,
  devices: DEVICES.length,
  tasks: TASKS.length,
  sessions: SESSIONS.length,
};
