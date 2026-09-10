/**
 * QA autocheck — the machine half of the post-collection review.
 *
 * Everything here is PURE, in the same sense as `domain.ts`: one function from
 * (expectation profile, run manifest) to gate results, with no D1, no R2 and no
 * clock. The route layer resolves the profile, builds or receives the manifest,
 * and writes the answer; this module only decides. That split is what makes the
 * six protocol steps unit-testable at their boundaries — "exactly 180 s", "exactly
 * 30 % of expected size" — without standing up a Worker.
 *
 * Ported from a real post-collection QA script (a Python checker for a wearable
 * study; see docs/QA_AUTOCHECK.md for the worked example and its numbers). The
 * port deliberately drops that study's device roster: the roster is *data*, not
 * code. CharmQuark's equivalent of a device is a sensor on a sensor rig, and the
 * expectation set belongs to the rig or the campaign, configurable per
 * deployment. Change a study, change a JSON column — not this file.
 *
 * The four result levels are the script's: pass | warn | fail | info. The one
 * rule that matters more than the rest: **a warn is never a pass.** It maps onto
 * `RED_FLAG`, which is neither PASS nor FAIL, so the gate roll-up can only reach
 * IN_PROGRESS and a human has to adjudicate it before the run reads as clean.
 */

// ---------------------------------------------------------------- levels
export type CheckLevel = "pass" | "warn" | "fail" | "info";

/**
 * Level -> the check-item vocabulary the QA panel and `PATCH /qa/check` already
 * speak. `RED_FLAG` is the load-bearing one: it exists precisely so a machine
 * warning is visible and blocking rather than quietly rounded up to PASS.
 */
export const RESULT_FOR_LEVEL: Record<CheckLevel, string> = {
  pass: "PASS",
  warn: "RED_FLAG",
  fail: "FAIL",
  info: "NOT_APPLICABLE",
};

/** Step 6's actionable output. Mirrors the reference script's three verdicts. */
export type Verdict = "ACCEPT" | "ACCEPT_WITH_WARNINGS" | "REJECT";

// ---------------------------------------------------------------- expectation profile
/** One sensor the profile expects to find in the manifest. */
export interface ExpectedSensor {
  /** Manifest key — the folder/prefix name the capture stack writes. */
  key: string;
  /** Human label shown in the panel, e.g. "Roof LiDAR (32-beam)". */
  role: string;
  /** Accepted file extensions, lowercase and dotted. First one is the canonical. */
  extensions: string[];
  /**
   * Expected megabytes per minute of recording. Per-minute rather than
   * per-segment so a profile survives a change of segment length: the reference
   * script's "660 MB per 10-minute activity" is 66 MB/min here.
   */
  expected_mb_per_min: number;
  /**
   * Whether a sidecar state file must sit alongside the asset. False for
   * manually-extracted sensors that write no sidecar (the script's
   * MANUAL_EXTRACT_DEVICES) — their durations are unknowable from the manifest
   * alone, so steps 3 and 6 say so instead of inventing a pass.
   */
  requires_state_file: boolean;
  /** Optional sensors are absent-by-design: missing is info, not fail. */
  optional?: boolean;
}

export interface ExpectationProfile {
  name: string;
  /** Segments (activities) per run, indexed 0..segment_count-1. */
  segment_count: number;
  /** Nominal seconds per segment; the size budget falls back to this when a duration is unknown. */
  segment_target_s: number;
  /** <= this is a test take, not a take. Reference protocol: 180 s. */
  duration_test_max_s: number;
  /** Below this (but above a test take) is possibly truncated. Reference: 480 s. */
  duration_warn_min_s: number;
  /** Size tolerance bands, as fractions of the expected size. */
  size_fail_low: number;
  size_warn_low: number;
  size_warn_high: number;
  /**
   * Capture-warning substrings that are routine noise for this rig and should be
   * counted but not escalated — the script's "WiFi scanner errors on watches are
   * expected" suppression, generalised. Matched case-insensitively.
   */
  suppressed_warning_keywords: string[];
  sensors: ExpectedSensor[];
}

/**
 * The seeded default: a ground-robot perception rig, not a wearable study. It is
 * a starting point a fleet lead is expected to edit, which is why it lives in a
 * JSON column on the rig rather than in this file's constants.
 */
export const DEFAULT_ROBOTICS_PROFILE: ExpectationProfile = {
  name: "Ground perception rig (default)",
  segment_count: 5,
  segment_target_s: 600,
  duration_test_max_s: 180,
  duration_warn_min_s: 480,
  size_fail_low: 0.3,
  size_warn_low: 0.6,
  size_warn_high: 1.6,
  suppressed_warning_keywords: ["wifi", "wi-fi", "ntp drift", "gnss reacquire"],
  sensors: [
    { key: "lidar_top", role: "Roof LiDAR (32-beam)", extensions: [".mcap"], expected_mb_per_min: 120, requires_state_file: true },
    { key: "stereo_front", role: "Front stereo pair", extensions: [".mcap"], expected_mb_per_min: 90, requires_state_file: true },
    { key: "imu_9dof", role: "IMU 9-DOF", extensions: [".mcap"], expected_mb_per_min: 1.2, requires_state_file: true },
    // The receiver logs its own RAWX stream; there is no capture-stack sidecar.
    { key: "gnss_rtk", role: "GNSS RTK receiver", extensions: [".ubx"], expected_mb_per_min: 0.35, requires_state_file: false },
    { key: "thermal_640", role: "Thermal 640", extensions: [".mp4"], expected_mb_per_min: 150, requires_state_file: false, optional: true },
  ],
};

// ---------------------------------------------------------------- manifest
/** One captured file: what actually landed, per sensor, per segment. */
export interface ManifestFile {
  sensor: string;
  segment: number;
  filename: string;
  size_bytes: number;
  /** Null when the source cannot say (an object listing carries no duration). */
  duration_s: number | null;
  /** Whether the sidecar state file was found next to this asset. */
  state_file: boolean;
  /** Warnings the capture stack logged for this segment. */
  capture_warnings?: string[];
}

export interface RunManifest {
  /** Where the manifest came from, so the panel can say whether it was derived. */
  source: "UPLOAD" | "R2";
  /** The prefix or session folder the manifest describes; shown in step 1. */
  root: string;
  files: ManifestFile[];
}

// ---------------------------------------------------------------- output
export interface AutoCheckItem {
  name: string;
  /** The current verdict — a human override writes here and only here. */
  result: string;
  /** What the machine said. Kept so an override stays visible as an override. */
  machine_result: string;
  level: CheckLevel;
  /** The specific sensor / file the finding is about, or null for roll-ups. */
  subject: string | null;
  detail: string;
}

export interface AutoGate {
  level: "FIELD" | "LAB" | "FINAL";
  name: string;
  /** Which protocol step this gate is. 1..6. */
  step: number;
  status: string;
  check_items: AutoCheckItem[];
}

export interface AutoCheckResult {
  gates: AutoGate[];
  verdict: Verdict;
  overall_status: string;
  profile_name: string;
  counts: { pass: number; warn: number; fail: number; info: number };
}

// ---------------------------------------------------------------- formatting helpers
const MB = 1024 * 1024;

export const bytesToMb = (n: number): number => n / MB;

export function formatSize(bytes: number): string {
  const mb = bytesToMb(bytes);
  return mb >= 1000 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.trunc(seconds));
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, "0")}s`;
}

const ext = (filename: string): string => {
  const dot = filename.lastIndexOf(".");
  return dot <= 0 ? "" : filename.slice(dot).toLowerCase();
};

// ---------------------------------------------------------------- gate assembly
interface GateBuilder {
  add(level: CheckLevel, name: string, detail: string, subject?: string | null): void;
  build(): AutoGate;
}

/**
 * Accumulates check items and hands back a gate.
 *
 * A closure rather than a class with parameter properties: the seed generator
 * runs this module through Node's strip-only TypeScript loader, which rejects
 * `constructor(private readonly x)`. Keeping the module loadable there is what
 * lets the seeded QA record be produced by the real checker.
 */
function gateBuilder(level: "FIELD" | "LAB" | "FINAL", name: string, step: number): GateBuilder {
  const items: AutoCheckItem[] = [];
  return {
    add(itemLevel, itemName, detail, subject = null) {
      const result = RESULT_FOR_LEVEL[itemLevel];
      items.push({ name: itemName, result, machine_result: result, level: itemLevel, subject, detail });
    },
    build: () => ({ level, name, step, status: rollUpGate(items), check_items: items }),
  };
}

/**
 * Gate status from its items. A single FAIL fails the gate; every item PASS (or
 * informational) passes it; anything else — crucially, any RED_FLAG — leaves it
 * IN_PROGRESS, which is how a warning is stopped from reading as a pass.
 *
 * Kept structurally identical to the roll-up the manual checklist already used,
 * so an autochecked gate and a hand-ticked one are scored by one rule.
 */
export function rollUpGate(items: { result: string }[]): string {
  if (items.some((i) => i.result === "FAIL")) return "FAIL";
  if (items.length === 0) return "NOT_STARTED";
  if (items.every((i) => i.result === "PASS" || i.result === "NOT_APPLICABLE" || i.result === "SKIP")) return "PASS";
  if (items.some((i) => i.result !== "PENDING" && i.result !== "NOT_CHECKED")) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export function rollUpOverall(gates: { status: string }[]): string {
  if (gates.some((g) => g.status === "FAIL")) return "FAIL";
  if (gates.length > 0 && gates.every((g) => g.status === "PASS")) return "PASS";
  return "IN_PROGRESS";
}

/**
 * Step 6's verdict, computed from the *current* results rather than the machine's
 * originals — so adjudicating a red flag actually moves the verdict, which is the
 * whole point of letting a human override.
 */
export function verdictFor(gates: { check_items: { result: string }[] }[]): Verdict {
  const results = gates.flatMap((g) => g.check_items.map((i) => i.result));
  if (results.includes("FAIL")) return "REJECT";
  if (results.some((r) => r === "RED_FLAG" || r === "ACCEPTABLE")) return "ACCEPT_WITH_WARNINGS";
  return "ACCEPT";
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  ACCEPT: "Accept",
  ACCEPT_WITH_WARNINGS: "Accept with warnings",
  REJECT: "Reject",
};

// ---------------------------------------------------------------- manifest indexing
type SensorIndex = Map<string, Map<number, ManifestFile[]>>;

function indexManifest(manifest: RunManifest): SensorIndex {
  const index: SensorIndex = new Map();
  for (const f of manifest.files) {
    const bySegment = index.get(f.sensor) ?? new Map<number, ManifestFile[]>();
    bySegment.set(f.segment, [...(bySegment.get(f.segment) ?? []), f]);
    index.set(f.sensor, bySegment);
  }
  return index;
}

/** The asset for a segment is the first file whose extension the profile accepts. */
const assetOf = (files: ManifestFile[], spec: ExpectedSensor): ManifestFile | undefined =>
  files.find((f) => spec.extensions.includes(ext(f.filename)));

// ---------------------------------------------------------------- the six steps
/** Step 1 — did extraction land? Every expected sensor has a folder in the manifest. */
function step1(profile: ExpectationProfile, manifest: RunManifest, index: SensorIndex): AutoGate {
  const g = gateBuilder("FIELD", "Extraction output", 1);
  const present = new Set(index.keys());

  g.add("info", "Manifest source", `${manifest.files.length} file(s) under ${manifest.root} (${manifest.source === "R2" ? "derived from object storage" : "uploaded"})`);

  for (const spec of profile.sensors) {
    if (present.has(spec.key)) {
      g.add("pass", `${spec.role} present`, `${spec.key}: ${index.get(spec.key)!.size} segment(s) found`, spec.key);
    } else if (spec.optional) {
      g.add("info", `${spec.role} absent`, `${spec.key} is optional for this profile — nothing captured`, spec.key);
    } else {
      g.add("fail", `${spec.role} missing`, `No files for ${spec.key} anywhere in the manifest`, spec.key);
    }
  }

  const expected = new Set(profile.sensors.map((s) => s.key));
  for (const key of [...present].filter((k) => !expected.has(k)).sort()) {
    // Not a failure — an unexpected sensor is usually a rename, but it is never
    // silently ignored, because it is also how a mis-mapped mount presents.
    g.add("warn", `Unexpected sensor ${key}`, `${key} is not in the "${profile.name}" profile`, key);
  }
  return g.build();
}

/** Step 2 — gaps: every sensor has every segment, each with its asset and sidecar. */
function step2(profile: ExpectationProfile, index: SensorIndex): AutoGate {
  const g = gateBuilder("FIELD", "Gaps: segments and sidecars", 2);

  for (const spec of profile.sensors) {
    const bySegment = index.get(spec.key);
    if (!bySegment) continue; // step 1 already failed this sensor.

    for (let seg = 0; seg < profile.segment_count; seg++) {
      const files = bySegment.get(seg);
      const label = `${spec.key}/segment ${seg}`;
      if (!files || files.length === 0) {
        g.add("fail", `${label}: segment missing`, `${spec.role} captured nothing for segment ${seg}`, label);
        continue;
      }
      const asset = assetOf(files, spec);
      if (!asset) {
        g.add("fail", `${label}: no ${spec.extensions.join("/")} asset`, `Found ${files.map((f) => f.filename).join(", ")} but none of the expected type`, label);
        continue;
      }
      if (spec.requires_state_file && !asset.state_file) {
        g.add("fail", `${label}: sidecar state file missing`, `${asset.filename} has no companion state file — timing cannot be verified`, label);
      } else {
        g.add("pass", `${label}: complete`, spec.requires_state_file ? `${asset.filename} + state file` : `${asset.filename} (no sidecar expected)`, label);
      }
    }

    // A sensor holding segments outside 0..n-1 usually means a re-take was left
    // in place; call it out rather than letting the extra segment ride along.
    const stray = [...bySegment.keys()].filter((s) => s < 0 || s >= profile.segment_count).sort((a, b) => a - b);
    if (stray.length > 0) {
      g.add("warn", `${spec.key}: unexpected segment(s)`, `Segments ${stray.join(", ")} sit outside the expected 0–${profile.segment_count - 1} sequence`, spec.key);
    }
  }
  return g.build();
}

/** Step 3 — was the whole run recorded? Segment counts and per-segment durations. */
function step3(profile: ExpectationProfile, index: SensorIndex): AutoGate {
  const g = gateBuilder("FIELD", "Run completeness and durations", 3);

  for (const spec of profile.sensors) {
    const bySegment = index.get(spec.key);
    if (!bySegment) continue;

    const inRange = [...bySegment.keys()].filter((s) => s >= 0 && s < profile.segment_count);
    if (inRange.length < profile.segment_count) {
      g.add("fail", `${spec.key}: incomplete`, `${inRange.length}/${profile.segment_count} segments present — the run may have been cut short`, spec.key);
    }

    for (const seg of inRange.sort((a, b) => a - b)) {
      const asset = assetOf(bySegment.get(seg) ?? [], spec);
      if (!asset) continue; // step 2 owns the missing-asset message.
      const label = `${spec.key}/segment ${seg}`;

      if (asset.duration_s === null) {
        // Honest about not knowing: a warn, not a pass. An object listing has no
        // duration, and a sensor with no sidecar cannot supply one either.
        g.add("warn", `${label}: duration unknown`, `No duration recorded for ${asset.filename} — verify by hand or re-derive the manifest with durations`, label);
        continue;
      }

      const shown = `${formatDuration(asset.duration_s)} (target ~${formatDuration(profile.segment_target_s)})`;
      if (asset.duration_s <= profile.duration_test_max_s) {
        g.add("fail", `${label}: test take`, `${shown} — at or under ${profile.duration_test_max_s}s this is a test take, not a take. Remove before upload.`, label);
      } else if (asset.duration_s < profile.duration_warn_min_s) {
        g.add("warn", `${label}: short`, `${shown} — under the ${profile.duration_warn_min_s}s floor, possibly truncated`, label);
      } else {
        g.add("pass", `${label}: full length`, shown, label);
      }
    }
  }
  return g.build();
}

/**
 * Expected bytes for one segment. Uses the actual duration when known so a
 * legitimately short segment is not also flagged as undersized — the size check
 * should catch a broken capture, not double-count a duration finding.
 */
export function expectedBytes(profile: ExpectationProfile, spec: ExpectedSensor, durationS: number | null): number {
  const minutes = (durationS ?? profile.segment_target_s) / 60;
  return spec.expected_mb_per_min * minutes * MB;
}

/** Step 4 — file sizes against the profile's tolerance bands. */
function step4(profile: ExpectationProfile, index: SensorIndex): AutoGate {
  const g = gateBuilder("LAB", "File sizes", 4);

  for (const spec of profile.sensors) {
    const bySegment = index.get(spec.key);
    if (!bySegment) continue;

    for (const seg of [...bySegment.keys()].sort((a, b) => a - b)) {
      const asset = assetOf(bySegment.get(seg) ?? [], spec);
      if (!asset) continue;
      const label = `${spec.key}/segment ${seg}`;
      const expect = expectedBytes(profile, spec, asset.duration_s);
      const ratio = expect > 0 ? asset.size_bytes / expect : 1;
      const shown = `${asset.filename} — ${formatSize(asset.size_bytes)} vs expected ~${formatSize(expect)} (${ratio.toFixed(2)}x)`;

      if (ratio < profile.size_fail_low) {
        g.add("fail", `${label}: severely undersized`, `${shown} — under ${(profile.size_fail_low * 100).toFixed(0)}% of expected; treat as a failed or corrupt capture`, label);
      } else if (ratio < profile.size_warn_low) {
        g.add("warn", `${label}: below expected`, `${shown} — under ${(profile.size_warn_low * 100).toFixed(0)}% of expected`, label);
      } else if (ratio > profile.size_warn_high) {
        g.add("warn", `${label}: above expected`, `${shown} — over ${(profile.size_warn_high * 100).toFixed(0)}% of expected; possible double capture`, label);
      } else {
        g.add("pass", `${label}: size in range`, shown, label);
      }
    }
  }
  return g.build();
}

/** Step 5 — file types. Every non-sidecar file must carry an accepted extension. */
function step5(profile: ExpectationProfile, index: SensorIndex): AutoGate {
  const g = gateBuilder("LAB", "File types", 5);

  for (const spec of profile.sensors) {
    const bySegment = index.get(spec.key);
    if (!bySegment) continue;

    for (const seg of [...bySegment.keys()].sort((a, b) => a - b)) {
      const label = `${spec.key}/segment ${seg}`;
      for (const f of bySegment.get(seg) ?? []) {
        const e = ext(f.filename);
        if (spec.extensions.includes(e)) {
          g.add("pass", `${label}: ${f.filename}`, `Correct type (${e})`, label);
        } else {
          g.add("fail", `${label}: wrong type`, `${f.filename} is ${e || "extensionless"}, expected ${spec.extensions.join(" or ")}`, label);
        }
      }
    }
  }
  return g.build();
}

/**
 * Step 6 — accept / reject. The actionable step: what must be pulled before
 * upload, and which capture warnings a human still has to read.
 */
function step6(profile: ExpectationProfile, index: SensorIndex): AutoGate {
  const g = gateBuilder("FINAL", "Accept / reject", 6);
  const suppressed = profile.suppressed_warning_keywords.map((k) => k.toLowerCase());

  let testTakes = 0;
  let flaggedWarnings = 0;

  for (const spec of profile.sensors) {
    const bySegment = index.get(spec.key);
    if (!bySegment) continue;

    for (const seg of [...bySegment.keys()].sort((a, b) => a - b)) {
      const label = `${spec.key}/segment ${seg}`;
      for (const f of bySegment.get(seg) ?? []) {
        if (f.duration_s !== null && f.duration_s <= profile.duration_test_max_s) {
          testTakes++;
          g.add("fail", `${label}: remove before upload`, `${f.filename} runs ${formatDuration(f.duration_s)} — a test take. Delete it, then re-run QA.`, label);
        }

        const warnings = f.capture_warnings ?? [];
        const noisy = warnings.filter((w) => suppressed.some((k) => w.toLowerCase().includes(k)));
        const real = warnings.filter((w) => !noisy.includes(w));

        for (const w of real.slice(0, 5)) {
          flaggedWarnings++;
          g.add("warn", `${label}: capture warning`, w, label);
        }
        if (real.length > 5) {
          g.add("warn", `${label}: further capture warnings`, `${real.length - 5} more warning(s) not listed`, label);
        }
        if (noisy.length > 0 && real.length === 0) {
          // Counted, named, and deliberately not escalated — the equivalent of the
          // reference script's routine WiFi-scanner noise on watches.
          g.add("info", `${label}: routine warnings suppressed`, `${noisy.length} known-benign warning(s) for this profile`, label);
        }
      }
    }
  }

  if (testTakes === 0) g.add("pass", "No test takes", "Every segment runs longer than the test-take threshold");
  if (flaggedWarnings === 0) g.add("pass", "No unexplained capture warnings", "Nothing outside the profile's known-benign list");
  return g.build();
}

// ---------------------------------------------------------------- entry point
/**
 * Run the six steps. Pure: same inputs, same output, no I/O, no `Date.now()`.
 */
export function autocheck(profile: ExpectationProfile, manifest: RunManifest): AutoCheckResult {
  const index = indexManifest(manifest);
  const gates: AutoGate[] = [
    step1(profile, manifest, index),
    step2(profile, index),
    step3(profile, index),
    step4(profile, index),
    step5(profile, index),
    step6(profile, index),
  ];

  const counts = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const g of gates) for (const i of g.check_items) counts[i.level]++;

  return {
    gates,
    verdict: verdictFor(gates),
    overall_status: rollUpOverall(gates),
    profile_name: profile.name,
    counts,
  };
}

// ---------------------------------------------------------------- profile parsing
const nOr = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const sOr = (v: unknown, fallback: string): string => (typeof v === "string" && v ? v : fallback);

/**
 * Coerce a stored JSON profile into a usable one, falling back field by field to
 * the default. A half-filled profile column must not be able to crash QA — the
 * worst it can do is inherit a default threshold, which is visible in the panel.
 */
export function parseProfile(raw: unknown, fallback: ExpectationProfile = DEFAULT_ROBOTICS_PROFILE): ExpectationProfile {
  if (!raw || typeof raw !== "object") return fallback;
  const p = raw as Record<string, unknown>;
  const sensors = Array.isArray(p["sensors"])
    ? (p["sensors"] as Record<string, unknown>[])
        .filter((s) => s && typeof s === "object" && typeof s["key"] === "string")
        .map((s): ExpectedSensor => ({
          key: String(s["key"]),
          role: sOr(s["role"], String(s["key"])),
          extensions: Array.isArray(s["extensions"]) && s["extensions"].length > 0
            ? (s["extensions"] as unknown[]).map((e) => String(e).toLowerCase())
            : [""],
          expected_mb_per_min: nOr(s["expected_mb_per_min"], 0),
          requires_state_file: s["requires_state_file"] === true,
          optional: s["optional"] === true,
        }))
    : fallback.sensors;

  return {
    name: sOr(p["name"], fallback.name),
    segment_count: Math.max(1, Math.trunc(nOr(p["segment_count"], fallback.segment_count))),
    segment_target_s: nOr(p["segment_target_s"], fallback.segment_target_s),
    duration_test_max_s: nOr(p["duration_test_max_s"], fallback.duration_test_max_s),
    duration_warn_min_s: nOr(p["duration_warn_min_s"], fallback.duration_warn_min_s),
    size_fail_low: nOr(p["size_fail_low"], fallback.size_fail_low),
    size_warn_low: nOr(p["size_warn_low"], fallback.size_warn_low),
    size_warn_high: nOr(p["size_warn_high"], fallback.size_warn_high),
    suppressed_warning_keywords: Array.isArray(p["suppressed_warning_keywords"])
      ? (p["suppressed_warning_keywords"] as unknown[]).map(String)
      : fallback.suppressed_warning_keywords,
    sensors: sensors.length > 0 ? sensors : fallback.sensors,
  };
}

/**
 * Coerce an untrusted manifest body. Rows that cannot name a sensor and a
 * segment are dropped rather than defaulted, because a file silently reassigned
 * to segment 0 would be worse than a file that is simply missing.
 */
export function parseManifest(raw: unknown): RunManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (!Array.isArray(m["files"])) return null;

  const files: ManifestFile[] = [];
  for (const entry of m["files"] as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const f = entry as Record<string, unknown>;
    const sensor = typeof f["sensor"] === "string" ? f["sensor"] : "";
    const segment = typeof f["segment"] === "number" ? Math.trunc(f["segment"]) : NaN;
    if (!sensor || Number.isNaN(segment)) continue;
    files.push({
      sensor,
      segment,
      filename: sOr(f["filename"], ""),
      size_bytes: Math.max(0, nOr(f["size_bytes"], 0)),
      duration_s: typeof f["duration_s"] === "number" ? f["duration_s"] : null,
      state_file: f["state_file"] === true,
      capture_warnings: Array.isArray(f["capture_warnings"]) ? (f["capture_warnings"] as unknown[]).map(String) : [],
    });
  }
  if (files.length === 0) return null;

  return {
    source: m["source"] === "R2" ? "R2" : "UPLOAD",
    root: sOr(m["root"], "(uploaded manifest)"),
    files,
  };
}

// ---------------------------------------------------------------- R2 derivation (pure half)
/** One object as an R2 listing reports it — the shape `VAULT.list()` hands back. */
export interface StoredObject {
  key: string;
  size: number;
  /** R2 custom metadata; `duration_s` is read from here when the uploader set it. */
  customMetadata?: Record<string, string>;
}

/** Filenames the capture stack writes as sidecars rather than assets. */
const isSidecar = (filename: string): boolean =>
  /(^\.|\.)(state|datastepstate)[^/]*\.json$/i.test(filename) || filename.toLowerCase().endsWith(".state.json");

/**
 * Turn an R2 listing into a manifest. Pure so it can be tested without a bucket;
 * the route does the `VAULT.list()` and hands the objects here.
 *
 * Layout assumed under the prefix: `<sensor>/<segment>/<filename>`. A key that
 * does not fit is ignored rather than guessed at — the alternative is inventing
 * a segment number, and a wrong segment number is a wrong QA result.
 */
export function manifestFromObjects(prefix: string, objects: StoredObject[]): RunManifest {
  const assets = new Map<string, ManifestFile>();
  const sidecars = new Set<string>();

  for (const obj of objects) {
    const rel = obj.key.startsWith(prefix) ? obj.key.slice(prefix.length) : obj.key;
    const parts = rel.split("/").filter(Boolean);
    if (parts.length < 3) continue;
    const [sensor, segRaw, ...rest] = parts;
    const segment = Number(segRaw);
    if (!sensor || !Number.isInteger(segment)) continue;
    const filename = rest.join("/");

    if (isSidecar(filename)) {
      sidecars.add(`${sensor}/${segment}`);
      continue;
    }
    const durationRaw = obj.customMetadata?.["duration_s"];
    const duration = durationRaw !== undefined && durationRaw !== "" ? Number(durationRaw) : NaN;
    const warningsRaw = obj.customMetadata?.["capture_warnings"];

    assets.set(obj.key, {
      sensor,
      segment,
      filename,
      size_bytes: obj.size,
      duration_s: Number.isFinite(duration) ? duration : null,
      state_file: false,
      capture_warnings: warningsRaw ? warningsRaw.split("|").filter(Boolean) : [],
    });
  }

  // Sidecars are discovered independently of asset order, so attach them last.
  const files = [...assets.values()].map((f) => ({ ...f, state_file: sidecars.has(`${f.sensor}/${f.segment}`) }));
  return { source: "R2", root: prefix, files };
}
