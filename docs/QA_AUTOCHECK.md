# QA autocheck

CharmQuark's post-collection QA used to be a hardcoded checklist a human ticked
by hand. It is now a **machine reading of what actually got captured**, leaving
people to adjudicate only what the machine flags.

The logic is a port of a real post-collection QA script — a Python checker that
validated Steps 1–6 of a wearable study's moderator protocol against an extracted
session folder (and, in a second variant, against an S3 prefix). The steps and
the thresholds carried over; that study's device roster deliberately did not. See
[the worked example](#the-worked-example) at the end.

---

## The three pieces

| Piece | What it is | Where it lives |
|---|---|---|
| **Expectation profile** | What *should* have been captured | JSON on `sensor_rigs.qa_profile`, falling back to `campaigns.qa_profile`, falling back to a built-in default |
| **Manifest** | What *was* captured | Posted to the QA endpoint, or derived by listing the run's R2 prefix |
| **Checker** | (profile, manifest) → gates + verdict | `api/src/qaAutocheck.ts` — pure, no I/O |

The checker is pure in exactly the sense `api/src/domain.ts` is: it takes
resolved records and returns plain data. The route layer (`api/src/routes/misc.ts`)
does the D1 reads, the R2 listing and the write. That is what makes each of the
six steps testable at its boundaries — `api/test/qaAutocheck.test.ts` pins
*exactly* 180 s and *exactly* 30 % / 60 % / 160 % without standing up a Worker.

---

## The expectation profile

```jsonc
{
  "name": "Manipulation Rig — 5 × 10 min",
  "segment_count": 5,          // segments (activities) per run, indexed 0..4
  "segment_target_s": 600,     // nominal seconds per segment
  "duration_test_max_s": 180,  // <= this is a test take, not a take
  "duration_warn_min_s": 480,  // below this (but above a test take) is possibly truncated
  "size_fail_low": 0.30,       // < 30 % of expected -> FAIL
  "size_warn_low": 0.60,       // < 60 % -> WARN
  "size_warn_high": 1.60,      // > 160 % -> WARN (possible double capture)
  "suppressed_warning_keywords": ["wifi", "ntp drift", "ft tare"],
  "sensors": [
    {
      "key": "lidar_top",                 // the folder/prefix the capture stack writes
      "role": "Roof LiDAR (32-beam)",     // the label the QA panel shows
      "extensions": [".mcap"],            // accepted file types, lowercase and dotted
      "expected_mb_per_min": 120,         // size budget per minute of recording
      "requires_state_file": true,        // must a sidecar state file sit alongside?
      "optional": false                   // optional sensors: missing is info, not fail
    }
  ]
}
```

Three choices worth knowing:

**Size is per *minute*, not per segment.** The reference script's "660 MB per
10-minute activity" becomes 66 MB/min. A profile then survives a change of segment
length, and a legitimately short segment is not also flagged as undersized —
step 4 budgets against the segment's actual duration when one is known, so the
"this is short" finding is made once, in step 3, where it belongs.

**`requires_state_file: false` is the generalised "manual extract" case.** The
reference script had two devices that produced no `.dataStepState` JSON. Here it
is a per-sensor flag: no sidecar expected, and — because the duration usually
came from that sidecar — no invented duration either. Step 3 warns that it cannot
tell rather than passing.

**The profile sits on the rig, not the campaign.** The rig is what physically
carries the sensors: two campaigns sharing a rig should not have to agree on its
file sizes, and a campaign that swaps rigs mid-programme should not silently keep
the old expectations. The campaign column exists as the fallback for a deployment
that thinks in programmes rather than hardware.

Editing a profile is a JSON write. It is **not** a code change, which is the
whole point of the port: the study's roster was data pretending to be code.

---

## The manifest

```jsonc
{
  "source": "UPLOAD",                       // or "R2" when derived
  "root": "runs/<run id>/",
  "files": [
    {
      "sensor": "lidar_top",
      "segment": 2,
      "filename": "lidar_top_02.mcap",
      "size_bytes": 1220542464,
      "duration_s": 600,                    // null when the source cannot say
      "state_file": true,                   // sidecar found alongside?
      "capture_warnings": ["lidar: 412 dropped packets between 03:11 and 03:18"]
    }
  ]
}
```

Rows that cannot name both a sensor and a segment are **dropped**, never
defaulted. A file silently reassigned to segment 0 would be worse than a file
that is simply missing: the first produces a confident wrong answer.

### Deriving it from R2

`POST /api/runs/:id/qa` with `{"derive_from_r2": true}` lists the run's vault
prefix and builds the manifest from the object listing — the R2 equivalent of the
reference script's S3 variant. The layout it parses:

```
runs/<run id>/<sensor>/<segment>/<filename>
runs/<run id>/<sensor>/<segment>/.dataStepState-*.json    # or *.state.json
```

A key that does not fit that shape is ignored rather than guessed at.

An object listing carries no duration, so the uploader should stamp one in R2
custom metadata (`duration_s`, and optionally `capture_warnings` as a
`|`-separated string). Without it, step 3 warns "duration unknown" for every
segment — correct, and visibly so.

If the vault is unbound or the prefix is empty, QA falls back to the manual
checklist rather than failing: a run whose capture has not been uploaded yet is
not a run that failed QA.

---

## The six steps, as gates

Each protocol step becomes one gate, carrying its step number.

| Step | Gate | Level | What fails it |
|---|---|---|---|
| 1 | Extraction output | FIELD | A required sensor has no files at all. An unexpected sensor warns. |
| 2 | Gaps: segments and sidecars | FIELD | A missing segment, a missing asset of the expected type, or a missing sidecar where one is required. A segment outside `0..n-1` warns. |
| 3 | Run completeness and durations | FIELD | Fewer segments than the profile expects, or a segment at/under the test-take threshold. Short-but-not-test warns; unknown duration warns. |
| 4 | File sizes | LAB | Under `size_fail_low`. Under `size_warn_low` or over `size_warn_high` warns. |
| 5 | File types | LAB | Any file whose extension the sensor does not accept. |
| 6 | Accept / reject | FINAL | A test take that must be pulled before upload. Non-suppressed capture warnings warn; profile-known noise is counted as info. |

### Levels, and why a warn cannot pass

The checker speaks the reference script's four levels and maps them onto the
check-item vocabulary the panel and `PATCH /runs/:id/qa/check` already used:

| Level | `result` | Effect on the gate |
|---|---|---|
| `pass` | `PASS` | contributes to a PASS |
| `warn` | `RED_FLAG` | **neither PASS nor FAIL** |
| `fail` | `FAIL` | fails the gate and the run |
| `info` | `NOT_APPLICABLE` | never blocks |

The roll-up is: any `FAIL` → gate FAIL; all items `PASS`/`NOT_APPLICABLE` → gate
PASS; anything else → IN_PROGRESS. A `RED_FLAG` therefore lands in "anything
else", so **a warning can never roll up to a pass on its own** — the gate stops
at IN_PROGRESS, the run stops at IN_PROGRESS, and the only way past it is a human
explicitly moving that item. That is the structural version of "warn must not
silently pass"; it is not a convention anyone has to remember.

### The verdict

Step 6's output is the actionable one, recomputed from the *current* results (so
an override moves it) and stored on `qa_pipeline_runs.verdict`:

- **REJECT** — at least one `FAIL`.
- **ACCEPT_WITH_WARNINGS** — no failures, but flags a human must decide on.
- **ACCEPT** — everything clear.

The panel leads with it rather than burying it under six gates.

---

## Overrides

`PATCH /api/runs/:id/qa/check` is unchanged in shape. It writes `result` and
leaves `machine_result` alone, so the machine's original finding survives and the
panel renders the difference as **overridden**, with the machine's verdict shown
underneath. Adjudicating a red flag is the expected route to a clean autochecked
run; erasing what the machine said is not.

## Endpoints

| Call | Effect |
|---|---|
| `GET /api/runs/:id/qa` | The QA record, including `mode`, `verdict`, `profile_name` and the manifest it was checked against |
| `POST /api/runs/:id/qa` | `{manifest}` → autocheck it. `{derive_from_r2: true}` → list and autocheck. Empty body → derive if possible, else the manual checklist. Re-posting a manifest re-runs and replaces the gates |
| `PATCH /api/runs/:id/qa/check` | Override one item; gate, overall status and verdict all roll up |

The manifest is stored verbatim on the record. Without it a FAIL is
unreproducible — the object it named may already have been deleted, which is
exactly what the operator was told to do about it.

---

## The worked example

The reference implementation's own numbers, kept here because they are the
calibration the thresholds came from. Expressed as a profile they would be:

| Sensor (device) | Role | Ext | Per 10-min activity | → `expected_mb_per_min` | Sidecar? |
|---|---|---|---|---|---|
| `leftwatch`, `rightwatch` | Watch | `.mov` | ~660 MB | 66 | yes |
| `sensor001` | Sensor Phone | `.mov` | ~330 MB | 33 | yes |
| `observer001`–`observer004` | Observer Phone | `.mov` | ~1.3 GB | 130 | yes |
| `junoairpod001` | AirPods | `.esb` | ~800 KB | 0.08 | **no** |
| `insta360` | Insta360 | `.mp4` | ~1.5 GB | 150 | **no** |

with `segment_count: 5`, `segment_target_s: 600`,
`duration_test_max_s: 180`, `duration_warn_min_s: 480`, bands `0.30 / 0.60 / 1.60`,
and `suppressed_warning_keywords: ["wifi", "wi-fi", "wifid", "corewifi"]` — that
last one being the study's observation that WiFi-scanner failures on watches and
the sensor phone are routine and should be counted, not escalated.

Two details from that script worth preserving as lore:

- Its protocol document listed the Sensor Phone at **30 MB**; observed data was
  consistently ~330 MB. The script used 330 and said so. A profile is the right
  home for a correction like that — it is a fact about one deployment.
- The two sidecar-less devices were sidecar-less because they were extracted by
  hand. That is why `requires_state_file` is per-sensor rather than global.

## The seeded example

The demo dataset ships a deliberately **mixed** result on run 3 (`MANUAL_QA`,
Manipulation Rig) so the panel is worth looking at immediately:

- most segments pass;
- `stereo_front/segment 1` is 45 % of expected size — **warn**;
- a genuine dropped-packet warning on `lidar_top/segment 2` — **warn**;
- `imu_9dof/segment 3` runs 1 m 36 s — **fail** (a test take, twice: step 3 names
  it, step 6 says remove it);
- `ft_6axis/segment 4` arrived as `.csv` — **fail** (step 2 finds no valid asset,
  step 5 names the wrong type);
- routine WiFi and F/T-tare noise — **info**, counted and suppressed.

Verdict: **REJECT**. Fix the two failures and re-check and it becomes
ACCEPT_WITH_WARNINGS; adjudicate the two flags and it becomes ACCEPT.

The seeded gates are generated by calling the real checker from
`api/src/seedData.ts`, not hand-written — so the demo can never show a verdict
the code would not actually reach, and a threshold change shows up in the seed on
the next `npm run --prefix api db:seed:generate`.

## Testing

```bash
npm --prefix api test          # 18 unit tests over the pure checker
```
