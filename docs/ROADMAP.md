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

## A naming decision left open

The spec argues for renaming the core objects to fleet-native terms:

| Today | Spec proposes |
|---|---|
| `Study` | `Campaign` |
| `Task` | `Mission` |
| `Session` | `Run` |
| `TaskGroup` | `MissionGroup` |
| `DeviceFleet` | `SensorRig` |

The reasoning is sound — "fleet" meaning *sensors* rather than *robots* is a
permanent source of confusion, and `Run` reads far better than `Session` for a
recorded robot activity. It is deliberately **not** applied here: it touches
every table, route, type and page, and is better done as one deliberate
migration than folded into the port. Decide before real data is loaded — it is
cheap now and expensive later.
