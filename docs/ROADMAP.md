# Roadmap — built vs. specified

[`ROBOTOPS_SPEC.md`](ROBOTOPS_SPEC.md) specifies a full multisensor-fusion fleet
orchestration platform (51 tables). This repository implements the working core
of it. This page is the honest line between the two.

## Built and verified

| Area | State |
|---|---|
| D1 schema — 17 tables | ✅ `db/migrations/0001_init.sql`, validated against SQLite |
| Worker API — the full `/api/*` surface | ✅ `api/src/`, typechecks clean, smoke-tested end to end |
| Readiness engine (tasks, robot, operator, lab, sensor fleet, inventory, effort budget) | ✅ pure functions in `api/src/domain.ts` |
| Confirmation gate + two-phase session codes | ✅ zero-issue invariant enforced; `26W38m2L1S4` codes minted on confirm |
| Auto-scheduler — effort-budget packing, re-roll, auto-fill across a date range | ✅ packs to exactly 4 units |
| Run-sheet CSV round-trip (accept → collect → upload → reconcile repetitions) | ✅ verified 2/8 → 4/8 with revert of dropped tasks |
| Robot cancellation with platform-aware standby swap | ✅ prefers the same platform, warns on a cross-platform substitute |
| Risk calculator with a robot-operations hazard lexicon + Fleet-Lead legal gate | ✅ RBAC enforced (PM gets 403, Fleet Lead 200) |
| QA pipeline with gate/check rollup | ✅ three default gates incl. a multisensor-fusion gate |
| Document vault on R2, instruction versioning | ✅ |
| Catalog CSV export / preview / apply | ✅ |
| Web app — 20 routes, rebranded, Next 15 on Workers | ✅ builds and serves on the Cloudflare runtime |
| Fictional seed dataset | ✅ 11 robots, 3 labs, 5 operators, 14 sensors, 10 tasks, 7 sessions |

## Specified, not yet built

Ordered as the spec recommends (Appendix A):

1. **Sensor rigs as first-class objects** — `SensorModel`, `SensorRig`,
   `SensorRigSlot`, `ExtrinsicSet`. Today `devices` + `device_fleets` are a flat
   stand-in with no mounting geometry.
2. **Calibration and time sync as hard gates** — `CalibrationRecord`,
   `TimeSyncProfile`, `TimeSyncCheck`. Today the robot carries a single
   `calibration_valid` boolean; the spec makes validity *projected through run
   end* and adds PTP lock/offset checks. This is the single highest-value gap:
   without it a run can be recorded that is silently unusable for fusion.
3. **`is_launchable` preflight** — a live re-evaluation at launch time (battery
   reserve, storage headroom and write throughput, fresh heartbeat, config
   drift), distinct from scheduling-time readiness. See spec §5.
4. **Telemetry ingest** — Durable Objects per robot, Queues for ingest,
   Analytics Engine for time series. The `FLEET_STATUS` KV binding is already
   wired for the hot-status cache.
5. **DataOps lineage** — `RecordingArtifact`, `TopicCoverage`, `Dataset`,
   `DatasetVersion`, promotion gates on MCAP bags in R2.
6. **Maintenance by duty cycle** — `ServiceInterval`, `WorkOrder`, `PartStock`,
   `Incident`, MTBF/availability metrics.
7. **Operator certifications** — matching operators to robot platforms, plus
   availability windows.
8. **Multi-robot runs and lab bays** — `LabBay` as the real capacity unit,
   `RunRobot` for concurrent robots in one run.

## The naming decision — made and applied

The spec argued for renaming the core objects to fleet-native terms, and that
argument won. The rename is applied throughout — schema, API, types and UI:

| Was | Now | Why |
|---|---|---|
| `Study` | `Campaign` | "Collection campaign" is what practitioners actually say. |
| `TaskGroup` | `MissionGroup` | Follows `Mission`. |
| `Task` | `Mission` | The standard word in robotics and drone ops; an operator reads it without translating. |
| `Session` | `Run` | Standard in both robotics and ML ("training run", "eval run"); short, and it frees "session" for its ordinary meaning — the logged-in user's session. |
| `Device` | `Sensor` | Says what the thing is. |
| `DeviceFleet` | `SensorRig` | The important one: "fleet" now means *robots* and nothing else. Using it for sensors was a permanent source of confusion. |

Two guardrails came out of doing it: `FLEET_LEAD` and the `FLEET_STATUS` binding
keep their names, because there "fleet" correctly means robots.

## Design system

The UI is built on the brand mark — see [BRAND.md](BRAND.md). Tokens live in
`web/src/app/globals.css` and `web/src/lib/palette.ts`; there is no cyan or teal
anywhere in the app, deliberately.
