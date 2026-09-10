/**
 * Unit tests for the QA autocheck.
 *
 * Run with `npm --prefix api test`. No Worker, no D1, no R2 — the whole point of
 * keeping the checker pure is that its six steps and their boundaries can be
 * pinned here in milliseconds.
 *
 * The boundaries are the interesting part and each has its own case: exactly
 * 180 s (a test take, because the reference protocol's threshold is inclusive),
 * exactly 30 % / 60 % / 160 % of expected size (none of which trip, because the
 * bands are strict on both sides).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  autocheck,
  manifestFromObjects,
  parseManifest,
  parseProfile,
  rollUpGate,
  verdictFor,
  type ExpectationProfile,
  type ManifestFile,
  type RunManifest,
} from "../src/qaAutocheck.ts";

const MB = 1024 * 1024;

/** Two sensors, three segments: small enough to reason about, big enough to be real. */
const PROFILE: ExpectationProfile = {
  name: "test rig",
  segment_count: 3,
  segment_target_s: 600,
  duration_test_max_s: 180,
  duration_warn_min_s: 480,
  size_fail_low: 0.3,
  size_warn_low: 0.6,
  size_warn_high: 1.6,
  suppressed_warning_keywords: ["wifi"],
  sensors: [
    { key: "lidar", role: "LiDAR", extensions: [".mcap"], expected_mb_per_min: 100, requires_state_file: true },
    { key: "gnss", role: "GNSS", extensions: [".ubx"], expected_mb_per_min: 1, requires_state_file: false },
    { key: "thermal", role: "Thermal", extensions: [".mp4"], expected_mb_per_min: 50, requires_state_file: false, optional: true },
  ],
};

/** A file at exactly `ratio` of the expected size for a full-length segment. */
function file(over: Partial<ManifestFile> & Pick<ManifestFile, "sensor" | "segment">): ManifestFile {
  const spec = PROFILE.sensors.find((s) => s.key === over.sensor)!;
  const duration = over.duration_s === undefined ? 600 : over.duration_s;
  return {
    filename: `${over.sensor}_${over.segment}${spec.extensions[0]}`,
    size_bytes: Math.round(spec.expected_mb_per_min * ((duration ?? 600) / 60) * MB),
    duration_s: duration,
    state_file: spec.requires_state_file,
    capture_warnings: [],
    ...over,
  };
}

/** A clean run: every required sensor, every segment, everything in tolerance. */
function cleanManifest(): RunManifest {
  const files: ManifestFile[] = [];
  for (const key of ["lidar", "gnss"]) {
    for (let segment = 0; segment < PROFILE.segment_count; segment++) {
      files.push(file({ sensor: key, segment }));
    }
  }
  return { source: "UPLOAD", root: "runs/test/", files };
}

const gate = (r: ReturnType<typeof autocheck>, step: number) => r.gates.find((g) => g.step === step)!;
const levels = (r: ReturnType<typeof autocheck>, step: number) => gate(r, step).check_items.map((i) => i.level);
const details = (r: ReturnType<typeof autocheck>, step: number) =>
  gate(r, step).check_items.map((i) => `${i.name} :: ${i.detail}`).join("\n");

/** Size that lands exactly on a band edge for a 600 s LiDAR segment. */
const lidarBytesAt = (ratio: number) => Math.round(100 * 10 * MB * ratio);

// ---------------------------------------------------------------- baseline
test("a clean run passes every step and accepts", () => {
  const r = autocheck(PROFILE, cleanManifest());
  assert.equal(r.verdict, "ACCEPT");
  assert.equal(r.overall_status, "PASS");
  assert.equal(r.counts.fail, 0);
  assert.equal(r.counts.warn, 0);
  for (const g of r.gates) assert.equal(g.status, "PASS", `${g.name} should pass`);
});

// ---------------------------------------------------------------- step 1
test("step 1 fails a missing required sensor and stays quiet about a missing optional one", () => {
  const m = cleanManifest();
  m.files = m.files.filter((f) => f.sensor !== "gnss");
  const r = autocheck(PROFILE, m);

  assert.ok(levels(r, 1).includes("fail"));
  assert.match(details(r, 1), /GNSS missing/);
  // "thermal" is optional and absent in every fixture; it must never be a failure.
  assert.match(details(r, 1), /Thermal absent/);
  assert.equal(gate(r, 1).check_items.filter((i) => i.level === "fail").length, 1);
  assert.equal(r.verdict, "REJECT");
});

test("step 1 warns about a sensor the profile does not know", () => {
  const m = cleanManifest();
  m.files.push({ sensor: "mystery", segment: 0, filename: "x.bin", size_bytes: 10, duration_s: 600, state_file: false });
  const r = autocheck(PROFILE, m);

  const item = gate(r, 1).check_items.find((i) => i.name.includes("mystery"))!;
  assert.equal(item.level, "warn");
  assert.equal(item.result, "RED_FLAG");
  assert.equal(r.verdict, "ACCEPT_WITH_WARNINGS");
});

// ---------------------------------------------------------------- step 2
test("step 2 fails a missing segment and a missing sidecar independently", () => {
  const m = cleanManifest();
  m.files = m.files.filter((f) => !(f.sensor === "lidar" && f.segment === 1));
  const lidar2 = m.files.find((f) => f.sensor === "lidar" && f.segment === 2)!;
  lidar2.state_file = false;
  const r = autocheck(PROFILE, m);

  const text = details(r, 2);
  assert.match(text, /lidar\/segment 1: segment missing/);
  assert.match(text, /lidar\/segment 2: sidecar state file missing/);
  // The GNSS has requires_state_file:false, so its missing sidecar is not a finding.
  assert.doesNotMatch(text, /gnss\/segment \d: sidecar/);
});

test("step 2 warns about a segment outside the expected sequence", () => {
  const m = cleanManifest();
  m.files.push(file({ sensor: "lidar", segment: 7 }));
  const r = autocheck(PROFILE, m);

  const item = gate(r, 2).check_items.find((i) => i.name.includes("unexpected segment"))!;
  assert.equal(item.level, "warn");
  assert.match(item.detail, /Segments 7/);
});

// ---------------------------------------------------------------- step 3, and the duration boundary
test("step 3: exactly 180s is a test take, 181s is merely short", () => {
  for (const [duration, expected] of [[180, "fail"], [181, "warn"]] as const) {
    const m = cleanManifest();
    const target = m.files.find((f) => f.sensor === "lidar" && f.segment === 0)!;
    target.duration_s = duration;
    // Keep the size proportional so step 4 does not also fire and muddy the read.
    target.size_bytes = Math.round(100 * (duration / 60) * MB);
    const r = autocheck(PROFILE, m);

    const item = gate(r, 3).check_items.find((i) => i.subject === "lidar/segment 0")!;
    assert.equal(item.level, expected, `${duration}s should be ${expected}`);
  }
});

test("step 3: exactly the warn floor (480s) is a full-length pass", () => {
  const m = cleanManifest();
  const target = m.files.find((f) => f.sensor === "lidar" && f.segment === 0)!;
  target.duration_s = 480;
  target.size_bytes = Math.round(100 * 8 * MB);
  const r = autocheck(PROFILE, m);

  assert.equal(gate(r, 3).check_items.find((i) => i.subject === "lidar/segment 0")!.level, "pass");
});

test("step 3 warns rather than passes when a duration is unknown", () => {
  const m = cleanManifest();
  m.files.find((f) => f.sensor === "lidar" && f.segment === 0)!.duration_s = null;
  const r = autocheck(PROFILE, m);

  const item = gate(r, 3).check_items.find((i) => i.subject === "lidar/segment 0")!;
  assert.equal(item.level, "warn");
  assert.match(item.detail, /No duration recorded/);
  assert.equal(r.verdict, "ACCEPT_WITH_WARNINGS");
});

test("step 3 fails a sensor that is short of segments", () => {
  const m = cleanManifest();
  m.files = m.files.filter((f) => !(f.sensor === "lidar" && f.segment === 2));
  const r = autocheck(PROFILE, m);

  assert.match(details(r, 3), /lidar: incomplete[\s\S]*2\/3 segments/);
});

// ---------------------------------------------------------------- step 4, and the size boundaries
test("step 4: the tolerance bands are strict at 30%, 60% and 160%", () => {
  const cases: [number, string][] = [
    [0.29, "fail"],
    [0.3, "warn"],   // exactly the fail floor is not a fail
    [0.59, "warn"],
    [0.6, "pass"],   // exactly the warn floor is in range
    [1.6, "pass"],   // exactly the warn ceiling is in range
    [1.61, "warn"],
  ];
  for (const [ratio, expected] of cases) {
    const m = cleanManifest();
    m.files.find((f) => f.sensor === "lidar" && f.segment === 0)!.size_bytes = lidarBytesAt(ratio);
    const r = autocheck(PROFILE, m);

    const item = gate(r, 4).check_items.find((i) => i.subject === "lidar/segment 0")!;
    assert.equal(item.level, expected, `ratio ${ratio} should be ${expected}, detail: ${item.detail}`);
  }
});

test("step 4 sizes against the actual duration, so a short segment is not double-penalised", () => {
  const m = cleanManifest();
  const target = m.files.find((f) => f.sensor === "lidar" && f.segment === 0)!;
  target.duration_s = 300;
  target.size_bytes = Math.round(100 * 5 * MB); // exactly right for five minutes

  const r = autocheck(PROFILE, m);
  assert.equal(gate(r, 4).check_items.find((i) => i.subject === "lidar/segment 0")!.level, "pass");
  // Step 3 still says it is short — the finding belongs there, once.
  assert.equal(gate(r, 3).check_items.find((i) => i.subject === "lidar/segment 0")!.level, "warn");
});

// ---------------------------------------------------------------- step 5
test("step 5 fails a wrong extension and names the file", () => {
  const m = cleanManifest();
  m.files.find((f) => f.sensor === "gnss" && f.segment === 1)!.filename = "gnss_1.csv";
  const r = autocheck(PROFILE, m);

  const item = gate(r, 5).check_items.find((i) => i.level === "fail")!;
  assert.match(item.detail, /gnss_1\.csv is \.csv, expected \.ubx/);
  assert.equal(r.verdict, "REJECT");
});

// ---------------------------------------------------------------- step 6
test("step 6 flags a test take for removal and rejects the run", () => {
  const m = cleanManifest();
  const target = m.files.find((f) => f.sensor === "lidar" && f.segment === 1)!;
  target.duration_s = 90;
  target.size_bytes = Math.round(100 * 1.5 * MB);
  const r = autocheck(PROFILE, m);

  assert.match(details(r, 6), /remove before upload[\s\S]*a test take/);
  assert.equal(r.verdict, "REJECT");
});

test("step 6 suppresses profile-known noise but surfaces everything else", () => {
  const m = cleanManifest();
  m.files.find((f) => f.sensor === "lidar" && f.segment === 0)!.capture_warnings = ["WiFi scan failed"];
  m.files.find((f) => f.sensor === "lidar" && f.segment === 1)!.capture_warnings = ["imu saturation on axis Z"];
  const r = autocheck(PROFILE, m);

  const items = gate(r, 6).check_items;
  const suppressed = items.find((i) => i.subject === "lidar/segment 0" && i.level === "info")!;
  assert.match(suppressed.detail, /1 known-benign warning/);

  const surfaced = items.find((i) => i.subject === "lidar/segment 1" && i.level === "warn")!;
  assert.equal(surfaced.detail, "imu saturation on axis Z");
  assert.equal(r.verdict, "ACCEPT_WITH_WARNINGS");
});

// ---------------------------------------------------------------- warn never silently passes
test("a warn blocks the gate and the overall status, and only an override clears it", () => {
  const m = cleanManifest();
  m.files.find((f) => f.sensor === "lidar" && f.segment === 0)!.size_bytes = lidarBytesAt(0.5);
  const r = autocheck(PROFILE, m);

  assert.equal(gate(r, 4).status, "IN_PROGRESS", "a warn must not roll up to PASS");
  assert.equal(r.overall_status, "IN_PROGRESS");
  assert.equal(r.verdict, "ACCEPT_WITH_WARNINGS");

  // A human adjudicates the flag — the route's PATCH does exactly this.
  const flagged = gate(r, 4).check_items.find((i) => i.result === "RED_FLAG")!;
  flagged.result = "PASS";
  assert.equal(rollUpGate(gate(r, 4).check_items), "PASS");
  assert.equal(verdictFor(r.gates), "ACCEPT");
  // The machine's original finding survives the override.
  assert.equal(flagged.machine_result, "RED_FLAG");
});

// ---------------------------------------------------------------- parsing and derivation
test("parseProfile falls back field by field rather than throwing", () => {
  const p = parseProfile({ name: "partial", sensors: [{ key: "only" }] });
  assert.equal(p.name, "partial");
  assert.equal(p.segment_count, 5);           // from the default
  assert.equal(p.sensors[0].role, "only");    // role defaults to the key
  assert.equal(p.sensors[0].requires_state_file, false);
});

test("parseManifest drops rows that cannot name a sensor and a segment", () => {
  const m = parseManifest({
    files: [
      { sensor: "lidar", segment: 0, filename: "a.mcap", size_bytes: 1, duration_s: 600, state_file: true },
      { segment: 1, filename: "orphan.mcap" },
      { sensor: "lidar", filename: "no-segment.mcap" },
    ],
  });
  assert.equal(m?.files.length, 1);
  assert.equal(parseManifest({ files: [] }), null);
  assert.equal(parseManifest("nope"), null);
});

test("manifestFromObjects reads sensor/segment/filename and attaches sidecars", () => {
  const m = manifestFromObjects("runs/abc/", [
    { key: "runs/abc/lidar/0/lidar_0.mcap", size: 1234, customMetadata: { duration_s: "600" } },
    { key: "runs/abc/lidar/0/.dataStepState-1.json", size: 200 },
    { key: "runs/abc/gnss/1/gnss_1.ubx", size: 500 },
    { key: "runs/abc/stray-key-with-no-segment", size: 10 },
  ]);

  assert.equal(m.source, "R2");
  assert.equal(m.files.length, 2);
  const lidar = m.files.find((f) => f.sensor === "lidar")!;
  assert.equal(lidar.segment, 0);
  assert.equal(lidar.filename, "lidar_0.mcap");
  assert.equal(lidar.duration_s, 600);
  assert.equal(lidar.state_file, true);

  const gnss = m.files.find((f) => f.sensor === "gnss")!;
  assert.equal(gnss.state_file, false);
  assert.equal(gnss.duration_s, null);
});
