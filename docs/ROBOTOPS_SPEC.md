# CharmQuark — RobotOps / DataOps Capability Specification

**Status:** Draft v1 — implementation-driving
**Scope:** What a multisensor-fusion robot fleet orchestration + physical-AI data collection platform needs beyond the inherited Gala (research study orchestration) and LabOps (device lab automation) models.
**Target runtime:** Cloudflare Workers + D1 + R2 + KV + Durable Objects + Queues + Analytics Engine.

---

## 0. Executive summary

Gala models *a study that recruits humans to perform tasks in apartments while devices record them*. CharmQuark models *a fleet of robots that execute missions in lab bays while calibrated, time-synchronized sensor rigs record them*. The structural skeleton survives — a catalog of approved work, a scheduling engine with readiness gates, a session state machine, a QA pipeline — but four things change qualitatively:

1. **The subject is now a machine with state.** A Participant either shows up or doesn't. A Robot has battery, firmware, duty cycle, calibration validity, maintenance debt, and a safety envelope, and every one of those can silently invalidate a recording *after* the run is scheduled. Readiness must be re-evaluated at launch, not just at scheduling.
2. **Sensors are not "devices assigned to a study" — they are a rig with geometry and a clock.** Extrinsics, intrinsics, and time synchronization are the difference between a usable fusion dataset and 400 GB of garbage. These must be first-class, versioned, expiring entities and hard readiness gates.
3. **The output is not "collected_rows" — it is artifacts.** MCAP/rosbag files, per-topic coverage, drop and desync statistics, and a lineage chain to a versioned dataset that a training job consumes. DataOps is a peer of RobotOps, not an afterthought.
4. **Scheduling is fleet-scale.** Multi-robot runs, operator certification matching, charge windows, maintenance windows, bay capacity, and concurrency conflicts.

### Naming decision

| Gala | CharmQuark | Why |
|---|---|---|
| `Study` | **`Campaign`** | A funded, scoped data-collection program with a target yield. |
| `TaskGroup` | **`MissionGroup`** | Ordered grouping/phasing within a campaign. |
| `Task` | **`Mission`** | The reusable, approved *specification* of a maneuver/scenario to be executed and recorded. Catalog-level, not an instance. |
| `Session` | **`Run`** | A scheduled, executed instance: one time slot, one bay, one operator, one or more robots. |
| `TaskExecution` | **`MissionExecution`** | One rep of one mission variant inside a run. |
| `Participant` | **`Robot`** | The fleet asset under test and the subject of collection. |
| `Location` (APARTMENT) | **`Lab`** (+ **`LabBay`**) | Bays are the real capacity unit; a lab holds several. |
| `Device` | **`Sensor`** (instance) + **`SensorModel`** (catalog) | A physical serialized unit vs. its type. |
| `DeviceFleet` | **`SensorRig`** | A versioned payload configuration: which sensors, mounted where, with which extrinsics. |
| `Operator` | **`Operator`** (unchanged) | Human staff, now certification-gated. |
| `LocationBlackout` | **`LabBlackout`** | Unchanged in spirit. |

"Fleet" is retained as an informal grouping of robots (`RobotGroup`), *not* as a sensor concept — reusing `DeviceFleet` for sensor rigs would be a permanent source of confusion.

### Entity inventory (new + reshaped)

**Fleet assets:** `RobotPlatform`, `Robot`, `RobotGroup`, `RobotGroupMember`, `PowerState` (on Robot + `ChargeSession`), `DutyCycleLedger`
**Sensing:** `SensorModel`, `Sensor`, `SensorRig`, `SensorRigSlot`, `RigAssignment`, `CalibrationRecord`, `ExtrinsicSet`, `TimeSyncProfile`, `TimeSyncCheck`
**Facilities:** `Lab`, `LabBay`, `LabBlackout`, `LabCapability`
**People:** `Operator`, `CertificationType`, `OperatorCertification`, `OperatorAvailability`
**Work catalog:** `Campaign`, `MissionGroup`, `Mission`, `MissionVariant`, `MissionApproval`
**Execution:** `Run`, `RunRobot`, `MissionExecution`, `RunEvent` (execution log), `ReadinessSnapshot`
**DataOps:** `RecordingArtifact`, `TopicCoverage`, `QAPipelineRun`, `QAGateResult`, `Dataset`, `DatasetVersion`, `DatasetMember`, `LabelJob`, `PromotionGate`
**Maintenance & resources:** `ServiceInterval`, `MaintenanceDue`, `WorkOrder`, `WorkOrderPart`, `PartCatalog`, `PartStock`, `PartInstallation`, `Incident`, `KnownIssue`, `AvailabilityWindow`
**Ops:** `AlertRule`, `Alert`, `TelemetrySnapshot` (KV/AE-backed), `Document` (SOP corpus, retained from Gala)

---

## 1. The `Robot` entity

A robot is not a participant with a serial number. It is a stateful asset whose fitness to produce data is a *computed, time-decaying* property. Split the model in three: **platform** (type-level truth), **robot** (instance identity + slow-moving state), and **live state** (fast-moving, not in D1 — see §3).

### 1.1 `RobotPlatform` (type-level)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `code` | text | e.g. `QDX-4` |
| `name` | text | e.g. "Quadris DX-4" |
| `vendor` | text | internal or external integrator |
| `morphology` | enum | `WHEELED_DIFF`, `WHEELED_ACKERMANN`, `WHEELED_OMNI`, `TRACKED`, `QUADRUPED`, `BIPED`, `ARM_FIXED`, `ARM_MOBILE`, `AERIAL_MULTIROTOR`, `AMR_TOTE` |
| `kinematic_class` | enum | `HOLONOMIC`, `NONHOLONOMIC`, `LEGGED`, `SERIAL_MANIPULATOR`, `HYBRID_MOBILE_MANIPULATOR` |
| `dof` | int | total actuated degrees of freedom |
| `payload_capacity_kg` | real | limits which rigs can mount |
| `mass_kg`, `footprint_l_mm`, `footprint_w_mm`, `height_mm` | real | bay fit + safety zone sizing |
| `max_speed_mps`, `max_accel_mps2` | real | drives safety class and speed-limit policy |
| `battery_capacity_wh` | real | |
| `nominal_runtime_min` | int | at reference duty |
| `charge_time_min` | int | scheduling input for turnaround |
| `ingress_protection` | text | `IP54` etc. — gates outdoor/wet missions |
| `compute_module` | text | onboard compute SKU; drives recording bandwidth ceiling |
| `onboard_storage_gb` | int | hard cap on run length |
| `max_record_bandwidth_mbps` | real | **critical**: rig bitrate must not exceed this |
| `mount_points` | json | named mount frames with nominal poses, e.g. `[{"name":"mast_top","parent":"base_link","xyz":[0,0,0.82],"rpy":[0,0,0]}]` |
| `urdf_uri` | text | R2 key to the canonical kinematic model |
| `base_frame_id` | text | usually `base_link` |
| `safety_standard` | text | e.g. `ISO-10218-equiv`, `ISO-3691-4-equiv` (internal shorthand) |
| `default_safety_class` | enum | see below |
| `teleop_supported`, `autonomy_supported` | bool | |

### 1.2 `Robot` (instance)

**Identity**
`id`, `asset_tag` (human key, e.g. `QDX-4-007`), `name` (call sign, e.g. "Bramble"), `serial_number`, `platform_id`, `home_lab_id`, `current_lab_id`, `current_bay_id`, `owner_team`, `cost_center`, `acquired_at`, `warranty_expires_at`.

**Lifecycle / commission**
`lifecycle_state` ∈ `PROCUREMENT → RECEIVING → COMMISSIONING → ACTIVE → RESTRICTED → MAINTENANCE → QUARANTINED → RETIRED → DECOMMISSIONED`.
- `RESTRICTED` = usable but only for a subset of missions (e.g. teleop-only after an autonomy regression). Backed by `restriction_reason` and `restricted_mission_tags` (json).
- `QUARANTINED` = involved in an open safety incident; hard-blocked from scheduling regardless of health.
`commissioned_at`, `commission_checklist_id`, `decommissioned_at`, `retirement_reason`.

**Software / firmware**
`firmware_version`, `firmware_channel` (`STABLE`/`BETA`/`DEV`), `stack_version` (autonomy stack), `stack_git_sha`, `os_image`, `config_bundle_hash`, `last_ota_at`, `ota_pending_version`, `config_drift` (bool, computed: running hash ≠ desired hash).
> **Opinion:** `stack_git_sha` and `config_bundle_hash` must be recorded *on every Run*, not just on the robot. Data collected under an unrecorded software version is unusable for regression analysis. Fleet-level version pinning is a campaign-level constraint (`Campaign.pinned_stack_version`).

**Autonomy / capability**
`autonomy_level` ∈ `TELEOP_ONLY`, `ASSISTED`, `SUPERVISED_AUTONOMY`, `CONDITIONAL_AUTONOMY`, `FULL_AUTONOMY`.
`teleop_capable` (bool), `teleop_latency_budget_ms`, `capability_tags` (json: `["stair_climb","payload_tote","outdoor_gnss","dual_arm"]`) — matched against `Mission.required_capabilities`.

**Power state** (slow-moving mirror; live values live in KV/DO)
`battery_soc_pct`, `battery_soh_pct` (state of *health* — degrades, drives replacement), `battery_cycles`, `battery_serial`, `battery_temp_c`, `charge_state` ∈ `DISCHARGING`/`CHARGING`/`FULL`/`FAULT`/`SWAPPING`, `est_runtime_min`, `last_charge_completed_at`, `hot_swap_batteries` (bool — changes turnaround scheduling entirely).

**Health**
`health_status` ∈ `NOMINAL`, `DEGRADED`, `FAULT`, `OFFLINE`, `UNKNOWN`.
`health_score` (0–100, computed rollup), `active_fault_codes` (json), `last_heartbeat_at`, `last_self_test_at`, `self_test_result`, `comms_link` (`WIFI`/`5G`/`TETHER`/`NONE`), `rssi_dbm`.
> `UNKNOWN` (stale heartbeat) must be treated as *not ready*, never as nominal. A stale-heartbeat threshold (`heartbeat_stale_after_s`, default 120) belongs on the platform.

**Duty cycle / usage** — the real basis for maintenance (see §7)
`odometer_m`, `motor_hours`, `power_on_hours`, `mission_hours`, `joint_cycle_counts` (json per joint), `estop_count_lifetime`, `hard_fault_count_30d`, `last_duty_rollup_at`.

**Calibration state** (denormalized rollup of §2; source of truth is `CalibrationRecord`)
`calibration_status` ∈ `VALID`, `EXPIRING`, `EXPIRED`, `INVALID`, `NEVER`.
`calibration_valid_until`, `active_extrinsic_set_id`, `calibration_invalidated_reason` (e.g. `IMPACT_EVENT`, `SENSOR_SWAP`, `MOUNT_DISTURBED`).

**Safety**
`safety_class` ∈ `SC0_CAGED` (no humans in cell), `SC1_SUPERVISED` (trained operator present, barrier), `SC2_COLLAB` (shared space, speed/separation monitoring), `SC3_PUBLIC` (uninstructed persons possible).
`safety_review_status`, `safety_review_expires_at`, `estop_type` (`WIRED`, `WIRELESS`, `BOTH`), `estop_last_tested_at`, `estop_test_interval_days`, `speed_limit_mps_override`, `requires_spotter` (bool), `insurance_class`.

**Rig binding**
`active_rig_id` → `SensorRig`, `rig_mounted_at`, `rig_locked` (bool — prevents accidental reassignment mid-campaign).

**Scheduling**
`availability_state` ∈ `AVAILABLE`, `RESERVED`, `IN_RUN`, `CHARGING`, `MAINTENANCE`, `TRANSIT`, `OOS`.
`reserved_until`, `current_run_id`, `min_turnaround_min`, `max_daily_mission_hours` (duty limit — legged platforms in particular need this), `notes`.

---

## 2. Sensors, rigs, calibration, and time sync

### 2.1 Why this is the hard part

In a fusion dataset, three failures are silent at collection time and fatal at training time:

1. **Bad extrinsics.** A LiDAR–camera transform off by 1.5° produces point clouds that project onto the wrong pixels. Nothing errors. Labels get attached to the wrong geometry. You discover it months later when a detector trained on the data has a systematic depth bias. *There is no post-hoc fix without recalibration and re-projection, and often the data is simply discarded.*
2. **Unlocked time sync.** If the LiDAR spins on its own crystal and the cameras trigger on a software timer, a robot moving at 1.5 m/s smears 15 cm of position error into every 100 ms of clock skew. Motion-compensated deskewing is wrong; IMU pre-integration between frames is wrong; any temporal fusion (Kalman, factor graph, sequence model) trains against inconsistent timestamps. Symptoms look like sensor noise, so teams "fix" it by adding noise tolerance to the model — and permanently cap accuracy.
3. **Expired calibration on a robot that took an impact.** Intrinsics drift slowly (thermal, focus); extrinsics jump discontinuously (a collision, a mount re-torque, a sensor swap). Calendar expiry alone is insufficient — **events** must invalidate calibration.

Therefore: calibration validity and time-sync lock are **hard, blocking, non-overridable-by-default readiness gates**, evaluated at *launch*, with the evidence recorded on the Run.

### 2.2 Sensor modalities to model

Model modality as an enum on `SensorModel`, because per-modality fields differ and QA rules key off it.

| Modality | Key type-level fields | Key QA signals |
|---|---|---|
| `LIDAR_SPINNING` | channels, rpm/scan rate, range m, FoV v/h, points/s, returns | points-per-scan, ring dropouts, motion-deskew flag |
| `LIDAR_SOLID_STATE` | scan pattern, integration time, range | frame completeness, non-repetitive coverage % |
| `CAMERA_RGB` | resolution, fps, shutter (`GLOBAL`/`ROLLING`), lens mount, focal mm, HDR | exposure clipping %, dropped frames, blur metric |
| `CAMERA_STEREO` | baseline mm, sync mode, rectification model | left/right frame pairing, disparity validity % |
| `CAMERA_DEPTH` | tech (`SL`/`ToF`/`ACTIVE_STEREO`), depth range, depth fps | invalid-depth pixel %, multipath flags |
| `CAMERA_THERMAL` | resolution, NETD mK, radiometric bool, FFC interval | FFC (shutter) gaps, drift since FFC |
| `CAMERA_EVENT` | resolution, dynamic range, event rate cap | event-rate saturation |
| `IMU` | gyro/accel range, noise density, bias stability, ODR | ODR jitter, saturation, bias walk vs. datasheet |
| `GNSS` | constellations, RTK bool, base/NTRIP source, update Hz | fix type histogram (`NONE/2D/3D/FLOAT/FIXED`), HDOP, sats |
| `RADAR` | band, range, velocity resolution, FoV | detections/frame, interference flags |
| `TACTILE` | taxel count, sensitivity N, ODR | dead taxels, drift |
| `FORCE_TORQUE` | axes, range N/Nm, ODR, bias-zero interval | zero drift, saturation events |
| `JOINT_ENCODER` | resolution, absolute bool, ODR | missing joints, quantization |
| `MICROPHONE_ARRAY` | mics, sample rate, bit depth, array geometry | channel dropout, clipping |
| `WHEEL_ODOM` | ticks/rev, ODR | slip indicators vs. IMU |
| `AUX_ENV` | temp/humidity/lux | — |

### 2.3 `SensorModel` (catalog) — type-level

`id`, `model_code`, `vendor`, `modality`, `spec` (json: modality-specific block above), `nominal_rate_hz`, `min_rate_hz` (QA floor), `bandwidth_mbps_est`, `power_w`, `mass_g`, `interface` (`ETHERNET`/`USB3`/`GMSL2`/`CAN`/`SPI`/`PCIE`), `sync_capability` (`PTP_HW`, `PPS_IN`, `HW_TRIGGER_IN`, `HW_TRIGGER_OUT`, `GENLOCK`, `SW_ONLY`), `intrinsics_model` (`PINHOLE_RADTAN`, `KANNALA_BRANDT`, `EQUIDISTANT`, `OMNI`, `NONE`), `calibration_interval_days`, `driver_package`, `default_topics` (json), `firmware_min_version`.

### 2.4 `Sensor` (physical instance)

`id`, `sensor_model_id`, `serial_number`, `asset_tag`, `status` ∈ `IN_SERVICE`/`SPARE`/`REPAIR`/`RMA`/`RETIRED`, `firmware_version`, `owning_lab_id`, `installed_on_rig_id`, `installed_slot_id`, `installed_at`, `total_power_on_hours`, `impact_flag` (bool — set by shock event, forces recalibration), `last_intrinsic_calibration_id`, `intrinsics_valid_until`, `health_status`, `notes`.

> **Opinion:** intrinsics belong to the **Sensor instance** (lens+imager are unique). Extrinsics belong to the **(Rig, Slot, Sensor)** binding, and change whenever anything is unmounted. Modeling extrinsics on the sensor is the single most common schema mistake here.

### 2.5 `SensorRig` — the payload configuration entity

A rig is a *versioned, immutable-once-validated* configuration: a set of slots, each with a mount frame and a nominal pose, bound to specific sensor instances, plus a clock topology.

`SensorRig`: `id`, `code` (e.g. `RIG-URBAN-A`), `name`, `version` (int, monotonic), `parent_rig_id` (lineage when cloned), `platform_id` (which platforms it can mount on), `status` ∈ `DRAFT`/`VALIDATING`/`VALIDATED`/`DEPRECATED`, `base_frame_id`, `urdf_fragment_uri` (R2), `total_bandwidth_mbps` (computed sum), `total_power_w`, `total_mass_g`, `clock_topology` (see §2.7), `time_sync_profile_id`, `active_extrinsic_set_id`, `validated_at`, `validated_by_operator_id`, `notes`.

`SensorRigSlot`: `id`, `rig_id`, `slot_code` (`front_lidar`, `head_cam_left`), `modality_required`, `sensor_model_id` (required model or null=any of modality), `mount_point` (name on platform), `nominal_xyz` (json), `nominal_rpy` (json), `frame_id` (ROS frame this sensor publishes), `topics` (json), `sync_role` ∈ `MASTER`/`SLAVE_PTP`/`SLAVE_PPS`/`TRIGGERED`/`FREE_RUNNING`, `required` (bool), `notes`.

`RigAssignment`: which physical `Sensor` currently occupies which `SensorRigSlot`, with `assigned_at`/`removed_at` — this is the history that lets you answer "which physical LiDAR produced this bag file?" Six months later, that question decides whether a dataset is quarantined after an RMA reveals a factory defect.

> **Rule:** any `RigAssignment` change **invalidates the rig's `ExtrinsicSet`** and drops rig status to `VALIDATING`. No exceptions, no override. Swapping a "identical" camera changes extrinsics by millimeters and intrinsics by more.

### 2.6 Calibration entities

`ExtrinsicSet`: `id`, `rig_id`, `version`, `method` ∈ `TARGET_BOARD`/`TARGETLESS_MOTION`/`HAND_EYE`/`CAD_NOMINAL`/`MANUAL`, `transforms` (json: list of `{parent_frame, child_frame, xyz, quat, covariance}`), `reference_frame`, `computed_at`, `computed_by`, `bundle_uri` (R2: raw calibration recording + solver output), `residual_rms_px`, `residual_rms_m`, `reprojection_p95_px`, `status` ∈ `CANDIDATE`/`ACTIVE`/`SUPERSEDED`/`REJECTED`, `valid_from`, `valid_until`, `invalidated_at`, `invalidated_reason`.

`CalibrationRecord` (unified log covering intrinsic, extrinsic, IMU, and time-sync calibrations): `id`, `subject_type` (`SENSOR`/`RIG`/`ROBOT`), `subject_id`, `cal_type` ∈ `INTRINSIC`/`EXTRINSIC`/`IMU_BIAS`/`IMU_NOISE`/`CAMERA_IMU_TIMESHIFT`/`WHEEL_ODOM`/`FT_ZERO`/`TIME_SYNC`, `performed_at`, `performed_by_operator_id`, `procedure_id` (SOP `Document`), `result` ∈ `PASS`/`MARGINAL`/`FAIL`, `metrics` (json), `artifact_uri` (R2), `valid_until`, `supersedes_id`, `notes`.

**Acceptance thresholds** are policy, stored per campaign or per rig — do not hardcode. Sane defaults to seed:
- camera intrinsics reprojection RMS ≤ 0.35 px, p95 ≤ 0.8 px
- LiDAR↔camera extrinsic reprojection RMS ≤ 1.5 px at 10 m
- camera↔IMU time offset estimate |Δt| ≤ 2 ms with σ ≤ 0.5 ms
- IMU bias within 3σ of datasheet stability
- FT zero drift ≤ 0.5 N over 10 min

**Event-driven invalidation** (a queue consumer sets `calibration_status='INVALID'`):
impact/shock above platform threshold; E-stop collision event; any `RigAssignment` change; sensor firmware change; mount torque service; chassis repair work order closed; transport between labs (configurable per rig, default: invalidate for rigs with `>0.5 m` baseline).

### 2.7 Time synchronization as a first-class entity

`TimeSyncProfile`: `id`, `rig_id`, `topology` ∈ `PTP_GRANDMASTER_ONBOARD`, `PTP_GM_GNSS`, `PPS_PLUS_NMEA`, `HW_TRIGGER_CHAIN`, `GENLOCK`, `SW_NTP_ONLY`, `MIXED`; `grandmaster_source` (`GNSS_PPS`/`OCXO`/`HOST_CLOCK`), `ptp_domain`, `ptp_profile` (`gPTP_802.1AS`/`default`), `trigger_master_slot_id`, `trigger_rate_hz`, `max_offset_ns_allowed` (default 1_000_000 = 1 ms; 100_000 for high-speed platforms), `max_pdv_ns`, `holdover_tolerance_s`, `requires_gnss_lock` (bool), `clock_domain_map` (json: frame → clock domain).

`TimeSyncCheck` (per-run, and periodic): `id`, `robot_id`, `rig_id`, `run_id` (nullable), `checked_at`, `state` ∈ `LOCKED`/`ACQUIRING`/`HOLDOVER`/`FREE_RUN`/`UNKNOWN`, `master_offset_ns`, `path_delay_ns`, `pdv_ns_p95`, `gnss_fix_type`, `gnss_sats`, `pps_present` (bool), `per_sensor_offsets` (json: slot → ns), `worst_pair_skew_ns`, `worst_pair` (text), `verdict` ∈ `PASS`/`WARN`/`FAIL`, `evidence_uri`.

**What fails without it** (state this in the UI when the gate blocks a run):
- LiDAR deskewing uses the wrong pose → walls bow, points smear along motion axis.
- Camera↔LiDAR projection is offset by `v · Δt` → labels land on wrong objects; depth supervision is systematically biased.
- IMU pre-integration between camera frames integrates the wrong interval → VIO/SLAM converge to a wrong scale.
- Stereo pairs without genlock/trigger have inter-frame parallax → disparity is a lie at any motion.
- Multi-robot runs without a shared clock domain cannot be cross-registered at all.

**Rule:** `time_sync_locked` must be sampled at run start, sampled again at run end, and **continuously** during the run (any transition to `FREE_RUN` for > `holdover_tolerance_s` marks the affected time window as `DESYNC` in `TopicCoverage` and blocks train-set promotion for that segment).

---

## 3. Telemetry, health, and the Cloudflare storage split

### 3.1 What to ingest

**High-rate (1–10 Hz, per robot, never in D1):** battery SoC/voltage/current/temp, motor currents and temps, CPU/GPU/mem/thermal, disk free + write throughput, comms RSSI/latency/packet loss, pose + velocity, per-topic publish rate and drop count, PTP offset, GNSS fix quality, E-stop state, fault code set.

**Event-driven (irregular, durable):** E-stop assertions, collisions/impacts above threshold, fault code raise/clear, autonomy disengagements (teleop takeovers — count these obsessively; disengagements per km is the single best autonomy KPI), recording start/stop, OTA start/complete, charge start/complete, calibration invalidation, safety-zone violations.

**Rollups (per run / per day):** mission hours, distance, disengagements, mean/p95 topic rate, dropped-frame rate, desync seconds, bytes recorded, yield ratio, availability, MTBF inputs.

### 3.2 Cloudflare mapping (recommended, concrete)

| Concern | Store | Detail |
|---|---|---|
| Relational state, catalog, schedule, gates, lineage index | **D1** | All tables in §8. Keep row counts bounded: no raw telemetry, no per-frame rows. |
| Live per-robot state + command/coordination | **Durable Object `RobotActor`** (one per robot, id = robot uuid) | Holds last telemetry frame, connected WebSockets (dashboards + the robot agent), current run binding, in-flight commands, alarm-based staleness detection (`ctx.storage.setAlarm` → mark `OFFLINE` after `heartbeat_stale_after_s`). DO SQLite storage holds a ~1 h ring buffer for live charts. Single-writer semantics prevent the classic "two runs claimed the same robot" race. |
| Multi-robot run coordination | **Durable Object `RunCoordinator`** (one per run) | Barrier-syncs run start across robots, sequences mission executions, appends `RunEvent` log, computes live yield, drives the state machine, and writes the terminal state back to D1. |
| Bay/slot booking atomicity | **Durable Object `BayScheduler`** (one per lab-bay-day) | Serializes booking to eliminate double-booking; D1 rows are the durable projection. |
| Hot status for dashboards | **KV** | `status:robot:{id}` → compact JSON snapshot, TTL 60 s, written by the DO on change (debounced ≥1 s). `readiness:robot:{id}` → cached gate evaluation, TTL 30 s, **invalidated eagerly** on any gate-relevant write. Fleet roll-up `status:fleet:{lab_id}`. KV is read-optimized and eventually consistent — never gate a launch on KV; re-evaluate against D1+DO. |
| Telemetry ingest | **Queues** | Robot agent → Worker `/ingest` → `telemetry-queue` (batched, max_batch 100 / 5 s). Consumer fans out: Analytics Engine write, DO state update, threshold evaluation → `Alert`. Separate `artifact-queue` for post-run processing and `dataops-queue` for QA/indexing. Use a DLQ per queue. |
| Time-series metrics | **Analytics Engine** | One dataset `cq_telemetry`; blobs = `[robot_id, lab_id, run_id, metric, platform_code]`, doubles = `[value, ...]`, index = `robot_id`. Query via the SQL API for charts and MTBF/availability rollups. Cheap, high-cardinality-tolerant, ~90-day retention — acceptable; anything needing longer lives in D1 rollup tables. |
| Recordings, bundles, reports | **R2** | See key layout below. Multipart upload directly from the robot/edge uploader via presigned URLs; Worker never proxies bulk bytes. |
| SOP / documentation search (from LabOps) | **Vectorize + R2** | `Document` metadata in D1, text in R2, embeddings in Vectorize; daily briefing generation reads D1 + AE. |
| Long-running DataOps pipeline | **Workflows** | ingest → verify checksums → index MCAP → compute coverage/QA → write D1 → promote/quarantine. Durable retries matter: a 300 GB bag re-processing shouldn't restart from zero. |
| Scheduled jobs | **Cron Triggers** | nightly duty-cycle rollup, maintenance-due recompute, calibration-expiry sweep, daily briefing, availability/MTBF rollup. |

**R2 key layout (stable, sortable, lineage-friendly):**
```
raw/{campaign_code}/{run_code}/{robot_asset_tag}/{recording_id}.mcap
raw/{campaign_code}/{run_code}/{robot_asset_tag}/{recording_id}.mcap.idx
raw/.../{recording_id}.manifest.json          # topics, hashes, rig+extrinsic ids, sw versions
calib/{rig_code}/v{version}/extrinsics.json
calib/{rig_code}/v{version}/bundle.tar.zst
calib/sensor/{sensor_serial}/intrinsics-{cal_id}.json
qa/{run_code}/{recording_id}/report.json
datasets/{dataset_slug}/v{n}/manifest.jsonl    # one line per member recording+segment
labels/{label_job_id}/export.jsonl
```
Set object lifecycle: raw → Infrequent Access after 30 d; never auto-delete raw that is a member of a published `DatasetVersion` (enforce in the deletion job by checking D1 lineage).

---

## 4. Data collection & the DataOps pipeline

### 4.1 Reshaped run state machine

Gala: `DRAFT→ASSEMBLING→READY→CONFIRMED→IN_EXECUTION→COLLECTED→EXTRACTED→MANUAL_QA→VALIDATED→UPLOADED→DONE`.

CharmQuark `Run.state`:
```
DRAFT
  → ASSEMBLING        (robots/rig/operator/bay being bound)
  → READY             (all scheduling gates pass)
  → CONFIRMED         (operator + bay + robots reserved; launch gates not yet run)
  → PREFLIGHT         (NEW: live gate evaluation — health, calib, time sync, storage, battery)
  → IN_EXECUTION
  → RECORDING_COMPLETE  (was COLLECTED — robot stopped recording, bytes still local)
  → UPLOADING           (NEW: R2 multipart in progress, resumable)
  → INGESTED            (was EXTRACTED — checksums verified, MCAP indexed, topics enumerated)
  → AUTO_QA             (NEW: automated coverage/desync/drop analysis)
  → MANUAL_QA
  → VALIDATED
  → PUBLISHED           (was DONE — attached to a DatasetVersion)
Terminal side-states: ABORTED, SCRUBBED (data destroyed), QUARANTINED (calibration/sync defect found later)
```
`PREFLIGHT` is the most important addition: Gala confirms a session days ahead; a robot can be perfectly ready on Tuesday and have an expired calibration and 14% battery on Thursday. `QUARANTINED` is the second: retroactive invalidation (a bad extrinsic set discovered a week later) must propagate to every run and dataset member that used it.

### 4.2 `RecordingArtifact`

One row per recorded file per robot per run. `id`, `run_id`, `robot_id`, `rig_id`, `extrinsic_set_id`, `time_sync_check_id`, `format` (`MCAP`/`ROSBAG2`/`MP4_SIDECAR`/`RAW_BIN`), `r2_key`, `bytes`, `sha256`, `started_at_ns`, `ended_at_ns`, `duration_s`, `topic_count`, `message_count`, `compression`, `chunk_index_present` (bool), `stack_git_sha`, `config_bundle_hash`, `upload_state` (`PENDING`/`UPLOADING`/`COMPLETE`/`FAILED`), `upload_started_at`, `upload_completed_at`, `qa_status`, `retention_class` (`RAW_HOT`/`RAW_IA`/`ARCHIVE`/`SCRUB_PENDING`), `pii_status` (`UNSCANNED`/`FACES_DETECTED`/`BLURRED`/`CLEARED`).

> **Opinion: standardize on MCAP.** It is self-describing, indexed, supports mixed encodings, and is seekable — which makes per-topic statistics cheap (read the summary section, not the payload). If the fleet emits ROS 2 bags, convert at ingest and keep both only until QA passes.

### 4.3 `TopicCoverage` — per-topic QA

One row per topic per recording: `recording_id`, `topic`, `frame_id`, `slot_code`, `modality`, `schema_name`, `message_count`, `expected_count` (duration × nominal Hz), `mean_hz`, `p05_hz`, `max_gap_ms`, `gap_count_over_2x`, `dropped_est`, `drop_rate_pct`, `first_msg_ns`, `last_msg_ns`, `desync_ms_vs_reference`, `desync_seconds_total`, `payload_bytes`, `verdict` (`PASS`/`WARN`/`FAIL`), `notes`.

**Detection rules to implement:**
- *Dropped frames*: `drop_rate = 1 - message_count / expected_count`; also detect *bursts* via `max_gap_ms > 3 × nominal_period` — a 2 % uniform drop is tolerable, a 2 % drop concentrated in one 4 s hole is not.
- *Desync*: for each pair of sensors expected to be time-locked, compute nearest-neighbor timestamp deltas across the run; flag if p95 |Δt| exceeds `TimeSyncProfile.max_offset_ns_allowed`. Also flag *monotonic drift* (linear trend in Δt) separately from jitter — drift means a broken sync topology, jitter means load.
- *Clock jumps*: any negative timestamp delta on a topic ⇒ hard FAIL.
- *Stuck sensor*: identical consecutive payload hashes for > 1 s on a camera/LiDAR ⇒ FAIL.
- *Exposure/health*: per-modality checks from the table in §2.2.
- *Coverage vs. mission spec*: every `Mission.required_topics` must be present with `verdict != FAIL`.

**Yield metrics on the run:** `planned_duration_s`, `recorded_duration_s`, `usable_duration_s` (recorded minus FAIL windows), `yield_pct = usable/planned`, `reps_planned`, `reps_usable`, `bytes_recorded`, `bytes_usable`. Campaign progress should be measured in **usable** reps, never in scheduled reps — this is the single biggest reporting fix over Gala's `reps_actual`.

### 4.4 Annotation handoff

`LabelJob`: `id`, `dataset_version_id` (or `run_id`), `vendor` (`INTERNAL`/`EXTERNAL_A`…), `task_type` (`BBOX_2D`, `CUBOID_3D`, `SEMSEG`, `INSTANCE_SEG`, `KEYPOINT`, `TRAJECTORY`, `EVENT_TAG`, `TELEOP_INTERVENTION_REVIEW`), `spec_document_id`, `input_manifest_uri`, `frame_count`, `sampling_rule` (e.g. "2 Hz keyframes, all disengagement windows at 10 Hz"), `status` (`QUEUED`/`IN_PROGRESS`/`IN_REVIEW`/`DELIVERED`/`REJECTED`), `cost_estimate_usd`, `delivered_at`, `output_uri`, `qa_sample_pct`, `agreement_score` (inter-annotator), `rejected_reason`.

> Handoff must include the `ExtrinsicSet` and calibration bundle, not just the media. 3D cuboid annotation is impossible without extrinsics, and annotators projecting with stale transforms will produce plausible-looking, systematically wrong labels.

### 4.5 Dataset versioning & lineage

`Dataset` (slug, name, purpose, modality_mix, owner) → `DatasetVersion` (`version`, `status` ∈ `BUILDING`/`FROZEN`/`PUBLISHED`/`DEPRECATED`/`REVOKED`, `manifest_uri`, `manifest_sha256`, `member_count`, `total_bytes`, `total_duration_s`, `split_policy` json, `built_at`, `built_by`, `parent_version_id`, `notes`) → `DatasetMember` (one row per recording *or per time segment* of a recording: `recording_id`, `start_ns`, `end_ns`, `split` ∈ `TRAIN`/`VAL`/`TEST`/`HOLDOUT`, `label_job_id`, `weight`, `exclusion_reason`).

Lineage is queryable in both directions and that is the point:
`DatasetVersion → members → recordings → run → robot + rig + extrinsic_set + sensors + stack_sha`.
When `ExtrinsicSet` X is later marked `REJECTED`, one query finds every affected `DatasetVersion`; the system marks them `REVOKED` and opens an incident. Without this, a calibration defect silently poisons models for a year.

Segment-level members (not file-level) are required because a run is usually 80 % good with a 90-second desync hole.

### 4.6 Train-set promotion gates

A recording segment may be promoted into a `TRAIN` split only if **all** hold:
```
promotable(segment) :=
      recording.upload_state = 'COMPLETE'
  AND recording.sha256 verified
  AND extrinsic_set.status = 'ACTIVE'          -- not SUPERSEDED-with-defect, not REJECTED
  AND time_sync_check.verdict = 'PASS'
  AND segment not overlapping any DESYNC or FAIL window
  AND all mission.required_topics present with verdict != 'FAIL'
  AND max(drop_rate_pct over required topics) <= campaign.max_drop_rate_pct   -- default 2.0
  AND qa_pipeline_run.overall_status = 'PASS'
  AND run.state IN ('VALIDATED','PUBLISHED')
  AND robot.lifecycle_state <> 'QUARANTINED' at time of recording
  AND pii_status IN ('CLEARED','BLURRED')      -- if campaign.pii_required
  AND label_job.status = 'DELIVERED' if split requires labels
  AND NOT EXISTS (open Incident linked to this run with severity >= MAJOR)
```
`HOLDOUT` gets a stricter rule: additionally require `yield_pct >= 0.9` and no `WARN` verdicts — you cannot debug a model against a noisy holdout.

---

## 5. Readiness gates for CharmQuark

Gala's gates were static booleans on a task. CharmQuark needs **four layers**, evaluated at different times, all recorded as evidence.

### 5.1 Layer A — `Mission.is_approved` (catalog-level, slow)
```
mission.is_approved :=
      mission.instructions_complete
  AND mission.has_variants                              -- >= 1 MissionVariant
  AND (mission.risk_level = 'LOW' OR mission.safety_approval = 'APPROVED')
  AND (NOT mission.requires_legal_review OR mission.legal_approval = 'APPROVED')
  AND mission.required_topics IS NOT NULL AND length > 0
  AND mission.success_criteria IS NOT NULL
  AND mission.sop_document_id IS NOT NULL
```

### 5.2 Layer B — `Mission.is_schedulable` (campaign progress)
```
mission.is_schedulable :=
      mission.is_approved
  AND mission.schedule_status = 'AVAILABLE'
  AND (mission.reps_target - mission.reps_usable) > 0     -- usable, not attempted
  AND EXISTS a robot R with capable(R, mission)
  AND EXISTS a lab L with lab_supports(L, mission)
```
where
```
capable(R, mission) :=
      R.platform_id IN mission.allowed_platform_ids
  AND mission.required_capabilities ⊆ R.capability_tags
  AND rig_satisfies(R.active_rig, mission.required_modalities)
  AND R.autonomy_level >= mission.min_autonomy_level
  AND R.safety_class <= mission.max_safety_class_required
```

### 5.3 Layer C — `Run.is_ready` (scheduling-time, forward-looking)
```
run.is_ready :=
      run.mission_set ≠ ∅ AND ∀ m ∈ run.mission_set: m.is_approved
  AND ∀ r ∈ run.robots:
        r.lifecycle_state IN ('ACTIVE','RESTRICTED')
    AND r.lifecycle_state <> 'QUARANTINED'
    AND NOT overlaps(run.window, maintenance_windows(r))
    AND NOT overlaps(run.window, reservations(r) excluding this run)
    AND projected_calibration_valid(r, run.slot_date)      -- valid_until >= run end
    AND projected_battery_ok(r, run)                        -- see Layer D formula
    AND r.active_rig.status = 'VALIDATED'
    AND r.safety_review_expires_at >= run.slot_date
  AND operator_ok(run.operator_id, run)
  AND bay_ok(run.bay_id, run.window)
  AND (NOT run.requires_spotter OR run.spotter_operator_id IS NOT NULL)
  AND effort_units(run.mission_set) <= run.effort_budget
```
```
operator_ok(op, run) :=
      op.is_active
  AND NOT overlaps(run.window, op.out_of_office)
  AND op.available_on(run.slot_date, run.slot_time)
  AND ∀ r ∈ run.robots: certified(op, r.platform_id, level >= run.required_cert_level)
  AND ∀ m ∈ run.mission_set: m.required_certifications ⊆ op.active_certifications
  AND daily_assigned_hours(op, run.slot_date) + run.duration <= op.max_daily_hours

bay_ok(bay, window) :=
      bay.is_available
  AND NOT EXISTS LabBlackout covering window
  AND concurrent_runs(bay, window) < bay.capacity_concurrent
  AND bay.safety_class >= max(r.safety_class for r in run.robots)
  AND bay.footprint fits all robots + safety margin
  AND (NOT run.requires_gnss OR bay.gnss_available)
  AND lab_capabilities(bay.lab) ⊇ union(m.required_lab_capabilities)
```

### 5.4 Layer D — `Run.is_launchable` (PREFLIGHT, live, non-cacheable)

This is the gate Gala has no analogue for. Evaluated at `CONFIRMED → PREFLIGHT → IN_EXECUTION`, against the DO's live state, and **persisted as a `ReadinessSnapshot`** so that a later QA dispute can be resolved by evidence.
```
run.is_launchable :=
      run.is_ready                                   -- re-evaluated, not trusted from cache
  AND ∀ r ∈ run.robots:
        r.health_status = 'NOMINAL'                  -- DEGRADED requires explicit override
    AND now - r.last_heartbeat_at <= platform.heartbeat_stale_after_s
    AND r.active_fault_codes ∩ blocking_fault_codes = ∅
    AND r.estop_last_tested_at >= now - estop_test_interval_days
    AND r.calibration_status = 'VALID'
        AND r.active_extrinsic_set.valid_until >= run.projected_end
        AND ∀ s ∈ rig.sensors: s.intrinsics_valid_until >= run.projected_end
        AND rig.active_extrinsic_set.status = 'ACTIVE'
    AND time_sync_ok(r)
    AND sensors_nominal(r)
    AND storage_ok(r, run)
    AND battery_ok(r, run)
    AND r.config_drift = FALSE
    AND (campaign.pinned_stack_version IS NULL
         OR r.stack_version = campaign.pinned_stack_version)
  AND comms_ok(run)                                  -- teleop missions only
  AND operator_present(run)                          -- operator checked in
  AND safety_briefing_ack(run)
```
Sub-predicates:
```
time_sync_ok(r) :=
      latest TimeSyncCheck(r).state = 'LOCKED'
  AND |master_offset_ns| <= profile.max_offset_ns_allowed
  AND pdv_ns_p95 <= profile.max_pdv_ns
  AND (NOT profile.requires_gnss_lock OR gnss_fix_type IN ('RTK_FIXED','RTK_FLOAT','3D'))
  AND checked_at >= now - 300s

sensors_nominal(r) :=
   ∀ slot ∈ r.active_rig.slots WHERE slot.required:
        slot has a Sensor assigned
    AND sensor.status = 'IN_SERVICE'
    AND sensor.health_status = 'NOMINAL'
    AND sensor.impact_flag = FALSE
    AND live_rate_hz(slot) >= sensor_model.min_rate_hz
    AND sensor.firmware_version >= sensor_model.firmware_min_version

storage_ok(r, run) :=
      free_bytes(r) >= rig.total_bandwidth_mbps/8 * run.duration_s * 1.25   -- 25% headroom
  AND disk_write_mbps(r) >= rig.total_bandwidth_mbps/8 * 1.15
  AND r.onboard_storage_health <> 'FAILING'

battery_ok(r, run) :=
      r.charge_state <> 'FAULT'
  AND r.battery_soh_pct >= platform.min_soh_pct                -- default 70
  AND est_runtime_min(r) >= run.duration_min * 1.30            -- 30% reserve
  AND (r.charge_state <> 'CHARGING' OR projected_soc_at(run.start) satisfies above)
  AND r.battery_temp_c within platform operating range
```

### 5.5 Override policy

Not all gates are equal. Encode `gate.severity`:
- **HARD (never overridable):** calibration expired/invalid, time sync FAIL, robot QUARANTINED, safety review expired, operator not certified, storage insufficient, E-stop untested.
- **SOFT (overridable with reason + second approver, recorded on the run and stamped onto every resulting artifact):** health DEGRADED, battery reserve 15–30 %, config drift, non-required sensor offline, `WARN`-level sync.

Artifacts produced under an override are **excluded from `HOLDOUT`** and flagged in the dataset manifest. This is the mechanism that keeps "we shipped it anyway" from silently entering the training set.

`ReadinessSnapshot`: `id`, `run_id`, `robot_id`, `evaluated_at`, `phase` (`SCHEDULE`/`PREFLIGHT`/`POSTRUN`), `overall` (`PASS`/`PASS_WITH_OVERRIDE`/`FAIL`), `gates` (json: array of `{code, severity, status, observed, threshold, message}`), `overridden_by_operator_id`, `override_reason`, `approver_operator_id`.

---

## 6. Mission / campaign orchestration

### 6.1 Reshaped catalog

**`Campaign`** (was `Study`): `id`, `code`, `name`, `campaign_type` ∈ `PERCEPTION_DATA`, `MANIPULATION_DATA`, `NAV_BENCHMARK`, `REGRESSION_SUITE`, `ACCEPTANCE_TEST`, `ENDURANCE`, `CALIBRATION_SWEEP`; `objective`, `status`, `target_usable_hours`, `target_runs`, `default_rig_id`, `allowed_platform_ids` (json), `pinned_stack_version`, `max_drop_rate_pct`, `time_sync_tolerance_ns`, `pii_required` (bool), `retention_days`, `dataset_id` (destination), `start_date`, `end_date`, `owner_operator_id`, `budget_hours`.

**`MissionGroup`** (was `TaskGroup`): `campaign_id`, `name`, `order_index`, `phase` (e.g. `BASELINE`, `PERTURBATION`, `EDGE_CASE`).

**`Mission`** (was `Task`) — the reusable spec:
`campaign_id`, `mission_group_id`, `mission_code`, `name`, `status`, `review_status`, `duration_type` (`SHORT`/`MEDIUM`/`LONG` retained — effort budget still works), `est_duration_min`, `reps_target`, `reps_attempted`, `reps_usable`, `schedule_status`, `instructions_complete`, `risk_level`, `safety_approval`, `legal_approval`, `variants` (→ `MissionVariant` rows; keep the JSON only as a denormalized cache), `sop_document_id`, `instructions` (json), `success_criteria` (json), **new fleet fields:**
- `allowed_platform_ids` (json), `min_autonomy_level`, `max_safety_class_required`
- `required_capabilities` (json tags), `required_modalities` (json), `required_topics` (json), `required_lab_capabilities` (json: `["motion_capture","rain_rig","gnss_skyview","ramp_15deg"]`)
- `required_certifications` (json), `requires_spotter` (bool)
- `robot_count` (int, default 1 — enables multi-robot missions), `robot_roles` (json: `[{"role":"ego","platform":"QDX-4"},{"role":"traffic","platform":"AMR-T2"}]`)
- `env_conditions` (json: lighting lux range, floor surface, obstacle density, weather sim)
- `teleop_required` (bool), `expected_bandwidth_mbps`, `expected_bytes`
- `inventory_item_ids` (json) — retained: props, targets, fixtures

**`MissionVariant`**: `mission_id`, `variant_code`, `name`, `parameters` (json: speed, payload mass, lighting, obstacle layout), `weight` (sampling weight for balanced collection), `reps_target`, `reps_usable`, `active`.

### 6.2 `Run` (was `Session`)

Retained: `campaign_id`, `slot_date`, `slot_time`, `state`, `mission_scope`, `mission_group_id`, `mission_ids` (json), `mission_reps` (json), `completed_mission_ids`, `execution_log` → `RunEvent` rows, `operator_id`, `lab_id`, `provisional_code`, `encoded_code`, `run_seq`, `notes`.

Changed / added: `bay_id`, `spotter_operator_id`, `robot_count`, `duration_min`, `effort_budget` (default 4 units), `rig_id` (rig at time of run — snapshot, not FK-to-current), `stack_version_snapshot`, `requires_gnss`, `requires_teleop`, `preflight_snapshot_id`, `override_applied` (bool), `bytes_recorded`, `usable_duration_s`, `yield_pct`, `abort_reason`, `quarantine_reason`.

**`RunRobot`** (join, because runs are now multi-robot): `run_id`, `robot_id`, `role` (`EGO`/`TRAFFIC`/`TARGET`/`FOLLOWER`/`OBSERVER`), `rig_id`, `extrinsic_set_id`, `readiness_snapshot_id`, `battery_soc_start`, `battery_soc_end`, `distance_m`, `disengagements`, `estops`, `recording_ids` (json), `outcome` (`OK`/`PARTIAL`/`FAILED`/`NO_SHOW`).

**`MissionExecution`** (was `TaskExecution`): `run_id`, `mission_id`, `variant_id`, `rep_index`, `robot_id`, `started_at`, `ended_at`, `status` (`PENDING`/`RUNNING`/`SUCCESS`/`FAILED`/`ABORTED`/`INVALID`), `failure_mode` (`COLLISION`, `PERCEPTION_LOSS`, `PLANNER_TIMEOUT`, `HW_FAULT`, `OPERATOR_ABORT`, `SENSOR_DROPOUT`, `TIME_DESYNC`, `ENV_NOT_SET`), `disengagements`, `intervention_seconds`, `usable` (bool), `recording_segment_start_ns`, `recording_segment_end_ns`, `notes`.

> **Opinion:** `MissionExecution.usable` — set by AutoQA, not by the operator — is what increments `Mission.reps_usable`. The operator's "success" judgement and the data's usability are different facts and both must be stored.

### 6.3 Fleet-scale scheduling: what the auto-scheduler must add

Gala packs ~4 effort units of schedulable tasks into an hour. Keep that core, then add these constraints (this is effectively a constrained bin-packing / interval-scheduling problem; a greedy scorer with hard-constraint filtering is sufficient at fleet sizes < 200):

1. **Robot–mission capability matching** — filter candidate robots by `capable(R, mission)` before packing.
2. **Robot exclusivity** — a robot is in at most one run at a time; enforce in `BayScheduler` / `RobotActor` DO, not by an optimistic D1 check.
3. **Charging windows** — after each run, insert a mandatory `ChargeSession` of `ceil((soc_target - soc_end)/charge_rate)` unless `hot_swap_batteries`. Model as a blocking `AvailabilityWindow` of kind `CHARGE`. Scheduling a robot into back-to-back runs without this is the most common real-world failure.
4. **Duty limits** — `max_daily_mission_hours` per robot (thermal/wear), `max_daily_hours` per operator.
5. **Turnaround** — `min_turnaround_min` for rig checks, data offload, and bay reset. Offload time is real: 200 GB over 1 Gb/s is ~30 min.
6. **Maintenance windows block scheduling** — any `MaintenanceDue` with `status='DUE'` and `blocking=1`, or an open `WorkOrder` with `blocks_operation=1`, removes the robot from candidacy entirely.
7. **Calibration expiry look-ahead** — do not schedule a run whose *end* is past `calibration_valid_until`. Instead auto-propose a `CALIBRATION` mission in the preceding slot.
8. **Bay capacity & concurrency** — `LabBay.capacity_concurrent` (usually 1 for `SC1`+ bays, >1 for tabletop arm cells), plus lab-level `max_concurrent_runs` for shared safety officers / power budget.
9. **Multi-robot co-scheduling** — a `robot_count > 1` mission requires N mutually-available robots, one bay large enough, and one clock domain. Treat the robot set as an atomic reservation: partial reservation must roll back.
10. **Operator certification matching** — see `operator_ok`. Prefer the *least*-certified qualified operator to preserve senior capacity (a scheduling heuristic worth stating explicitly).
11. **Variant balancing** — when packing reps, prefer variants with the largest `reps_target - reps_usable` gap weighted by `MissionVariant.weight`, so a campaign doesn't finish 100 % of the easy variant and 20 % of the hard one.
12. **Lab capability matching** — mission needs `rain_rig`; only two bays have it.

Scoring for the greedy packer (after hard filters):
```
score(run_candidate) =
    3.0 * normalized_rep_gap
  + 2.0 * variant_balance_bonus
  + 1.5 * robot_utilization_fairness      -- prefer under-used robots (spreads wear)
  + 1.0 * calibration_headroom_days_norm  -- prefer robots not about to expire
  + 1.0 * battery_headroom
  - 2.0 * operator_overtime_penalty
  - 1.5 * turnaround_violation_slack
  - 3.0 * soft_gate_warning_count
```

### 6.4 Conflict detection

Persist an explicit `ScheduleConflict` view/materialization rather than discovering conflicts at launch: overlapping robot reservations, bay over-capacity, operator double-booking, maintenance overlap, calibration expiry crossing, blackout overlap. Surface as a "Schedule health" panel; block `CONFIRMED` on any hard conflict.

---

## 7. Maintenance & resource management

### 7.1 Usage-based service intervals (not calendar-only)

`ServiceInterval` is defined **per platform** (or per platform+part) with *whichever comes first* semantics across four counters:

`ServiceInterval`: `id`, `platform_id`, `code` (`LIDAR_MOUNT_TORQUE`), `name`, `category` (`PREVENTIVE`/`INSPECTION`/`CALIBRATION`/`CONSUMABLE`/`SAFETY`), `interval_days`, `interval_odometer_m`, `interval_motor_hours`, `interval_power_on_hours`, `interval_joint_cycles` (json per joint), `warn_at_pct` (default 80), `blocking` (bool — does hitting it stop scheduling), `est_labor_min`, `sop_document_id`, `required_parts` (json), `required_cert_id`.

`MaintenanceDue` (one row per robot × interval, recomputed nightly + on duty-rollup): `robot_id`, `interval_id`, `basis` (which counter is closest), `pct_consumed`, `due_at_estimate` (date, projected from recent duty rate), `status` ∈ `OK`/`WARN`/`DUE`/`OVERDUE`/`WAIVED`, `last_serviced_at`, `last_serviced_counters` (json snapshot), `blocking`, `work_order_id`.

> **Opinion:** projecting `due_at_estimate` from the trailing 14-day duty rate is what makes this useful — it lets the scheduler pre-book service into a low-demand slot instead of yanking a robot mid-campaign.

### 7.2 Work orders, parts, incidents

`WorkOrder`: `id`, `robot_id` (or `sensor_id` / `lab_id`), `wo_type` (`PREVENTIVE`/`CORRECTIVE`/`UPGRADE`/`CALIBRATION`/`RMA`/`INSPECTION`), `priority` (`P1`–`P4`), `status` (`OPEN`/`SCHEDULED`/`IN_PROGRESS`/`WAITING_PARTS`/`BLOCKED`/`DONE`/`CANCELLED`), `opened_at`, `opened_by`, `scheduled_start`, `scheduled_end`, `completed_at`, `assigned_operator_id`, `blocks_operation` (bool), `downtime_min`, `labor_min`, `symptom`, `root_cause`, `resolution`, `incident_id`, `maintenance_due_id`, `invalidates_calibration` (bool), `cost_parts_usd`, `cost_labor_usd`.

`PartCatalog`: `part_number`, `name`, `category`, `compatible_platform_ids` (json), `compatible_sensor_model_ids` (json), `is_consumable`, `expected_life_hours`, `unit_cost_usd`, `lead_time_days`, `supplier`, `min_stock`, `reorder_point`, `serialized` (bool).
`PartStock`: `part_id`, `lab_id`, `qty_on_hand`, `qty_reserved`, `qty_on_order`, `bin_location`, `last_counted_at`.
`PartInstallation`: `part_id`, `serial_number`, `robot_id`, `installed_at`, `removed_at`, `work_order_id`, `hours_at_install`, `hours_at_removal`, `failure_mode` — this is what produces real per-part life data and, eventually, honest reorder points.

`Incident`: `id`, `occurred_at`, `robot_id`, `run_id`, `lab_id`, `operator_id`, `severity` (`NEAR_MISS`/`MINOR`/`MAJOR`/`CRITICAL`), `category` (`COLLISION`, `ESTOP`, `FALL`, `THERMAL`, `BATTERY`, `PINCH`, `DATA_LOSS`, `SECURITY`, `PROPERTY_DAMAGE`, `INJURY`), `description`, `immediate_action`, `robot_quarantined` (bool), `calibration_invalidated` (bool), `reported_by`, `status` (`OPEN`/`INVESTIGATING`/`CORRECTIVE_ACTION`/`CLOSED`), `root_cause`, `corrective_actions` (json), `closed_at`, `regulatory_reportable` (bool), `artifact_uris` (json — the bag file *is* the incident evidence; link it).

`KnownIssue` (from LabOps): `id`, `title`, `scope_type` (`PLATFORM`/`SENSOR_MODEL`/`STACK_VERSION`/`FIRMWARE`), `scope_id`, `symptom`, `detection_signature` (json — fault codes / QA patterns that indicate it), `workaround`, `status` (`OPEN`/`MITIGATED`/`FIXED`), `fixed_in_version`, `affected_robot_ids` (json), `severity`, `first_seen_at`, `occurrence_count`. Auto-match incoming faults against `detection_signature` and surface "this is known issue KI-014, workaround: …" in the daily briefing — that is the highest-value carryover from LabOps.

### 7.3 Metrics

Nightly rollups into `FleetMetricDaily` (`date`, `scope_type` (`ROBOT`/`PLATFORM`/`LAB`/`FLEET`), `scope_id`, …):
- **Availability** = `uptime_min / scheduled_min` where downtime = maintenance + fault + charging-beyond-plan.
- **MTBF** = `operating_hours / count(failures)` where a failure = an `Incident` ≥ MINOR or a `WorkOrder` of type `CORRECTIVE`. Compute over a trailing 90-day window; report the count alongside — MTBF from 2 failures is noise, and the UI should say so.
- **MTTR** = mean `WorkOrder.downtime_min` for corrective orders.
- **Utilization** = `mission_hours / available_hours`.
- **Yield** = `usable_duration_s / recorded_duration_s`, and `usable/planned`.
- **Disengagements per hour / per km** (autonomy quality).
- **Calibration compliance** = % of fleet with `calibration_status='VALID'`.
- **Data throughput** = GB ingested, GB promoted, promotion ratio.
- **Cost per usable hour** = (labor + parts + amortization) / usable hours. This is the number leadership actually wants.

---

## 8. Proposed D1 schema (SQLite dialect)

Conventions: `id TEXT PRIMARY KEY` (uuidv7 — sortable, good index locality); booleans `INTEGER NOT NULL DEFAULT 0`; timestamps `INTEGER` (Unix epoch **seconds**, except recording boundaries which are `_ns` and stored as TEXT to avoid float/precision issues in JS); enums `TEXT` with `CHECK`; JSON as `TEXT` with `CHECK(json_valid(x))`. Every table gets `created_at`/`updated_at`.

```sql
PRAGMA foreign_keys = ON;

-- ============ FACILITIES ============
CREATE TABLE lab (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  lab_type TEXT NOT NULL CHECK (lab_type IN ('INDOOR_ARENA','WAREHOUSE_MOCK','HOME_MOCK','OUTDOOR_YARD','MANIPULATION_CELL','CALIBRATION_ROOM','GARAGE')),
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  capabilities TEXT CHECK (capabilities IS NULL OR json_valid(capabilities)), -- ["motion_capture","rain_rig",...]
  max_concurrent_runs INTEGER NOT NULL DEFAULT 2,
  is_available INTEGER NOT NULL DEFAULT 1,
  code_number INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE lab_bay (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL REFERENCES lab(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT,
  bay_kind TEXT NOT NULL CHECK (bay_kind IN ('OPEN_FLOOR','CAGED_CELL','TABLETOP','TRACK','RAMP','OUTDOOR_PAD')),
  length_mm INTEGER, width_mm INTEGER, ceiling_mm INTEGER,
  safety_class TEXT NOT NULL DEFAULT 'SC1_SUPERVISED'
    CHECK (safety_class IN ('SC0_CAGED','SC1_SUPERVISED','SC2_COLLAB','SC3_PUBLIC')),
  capacity_concurrent INTEGER NOT NULL DEFAULT 1,
  slots_per_day INTEGER NOT NULL DEFAULT 4,
  has_charging INTEGER NOT NULL DEFAULT 0,
  charger_count INTEGER NOT NULL DEFAULT 0,
  gnss_available INTEGER NOT NULL DEFAULT 0,
  ptp_grandmaster_available INTEGER NOT NULL DEFAULT 0,
  network_uplink_mbps INTEGER,
  capabilities TEXT CHECK (capabilities IS NULL OR json_valid(capabilities)),
  is_available INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (lab_id, code)
);

CREATE TABLE lab_blackout (
  id TEXT PRIMARY KEY,
  lab_id TEXT REFERENCES lab(id) ON DELETE CASCADE,
  bay_id TEXT REFERENCES lab_bay(id) ON DELETE CASCADE,
  blackout_date TEXT NOT NULL,           -- 'YYYY-MM-DD'
  slot_time TEXT,                        -- NULL = whole day
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (lab_id IS NOT NULL OR bay_id IS NOT NULL)
);
CREATE INDEX idx_blackout_date ON lab_blackout(blackout_date, lab_id, bay_id);

-- ============ PLATFORMS & ROBOTS ============
CREATE TABLE robot_platform (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  vendor TEXT,
  morphology TEXT NOT NULL CHECK (morphology IN ('WHEELED_DIFF','WHEELED_ACKERMANN','WHEELED_OMNI','TRACKED','QUADRUPED','BIPED','ARM_FIXED','ARM_MOBILE','AERIAL_MULTIROTOR','AMR_TOTE')),
  kinematic_class TEXT NOT NULL CHECK (kinematic_class IN ('HOLONOMIC','NONHOLONOMIC','LEGGED','SERIAL_MANIPULATOR','HYBRID_MOBILE_MANIPULATOR')),
  dof INTEGER,
  payload_capacity_kg REAL, mass_kg REAL,
  footprint_l_mm INTEGER, footprint_w_mm INTEGER, height_mm INTEGER,
  max_speed_mps REAL, max_accel_mps2 REAL,
  battery_capacity_wh REAL, nominal_runtime_min INTEGER, charge_time_min INTEGER,
  min_soh_pct INTEGER NOT NULL DEFAULT 70,
  ingress_protection TEXT,
  compute_module TEXT, onboard_storage_gb INTEGER, max_record_bandwidth_mbps REAL,
  mount_points TEXT CHECK (mount_points IS NULL OR json_valid(mount_points)),
  urdf_uri TEXT, base_frame_id TEXT NOT NULL DEFAULT 'base_link',
  safety_standard TEXT,
  default_safety_class TEXT NOT NULL DEFAULT 'SC1_SUPERVISED',
  teleop_supported INTEGER NOT NULL DEFAULT 1,
  autonomy_supported INTEGER NOT NULL DEFAULT 1,
  heartbeat_stale_after_s INTEGER NOT NULL DEFAULT 120,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE robot (
  id TEXT PRIMARY KEY,
  asset_tag TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  serial_number TEXT UNIQUE,
  platform_id TEXT NOT NULL REFERENCES robot_platform(id),
  home_lab_id TEXT REFERENCES lab(id),
  current_lab_id TEXT REFERENCES lab(id),
  current_bay_id TEXT REFERENCES lab_bay(id),
  owner_team TEXT, cost_center TEXT,
  acquired_at INTEGER, warranty_expires_at INTEGER,

  lifecycle_state TEXT NOT NULL DEFAULT 'COMMISSIONING'
    CHECK (lifecycle_state IN ('PROCUREMENT','RECEIVING','COMMISSIONING','ACTIVE','RESTRICTED','MAINTENANCE','QUARANTINED','RETIRED','DECOMMISSIONED')),
  restriction_reason TEXT,
  restricted_mission_tags TEXT CHECK (restricted_mission_tags IS NULL OR json_valid(restricted_mission_tags)),
  commissioned_at INTEGER, decommissioned_at INTEGER, retirement_reason TEXT,

  firmware_version TEXT, firmware_channel TEXT NOT NULL DEFAULT 'STABLE'
    CHECK (firmware_channel IN ('STABLE','BETA','DEV')),
  stack_version TEXT, stack_git_sha TEXT, os_image TEXT,
  config_bundle_hash TEXT, desired_config_hash TEXT,
  config_drift INTEGER NOT NULL DEFAULT 0,
  last_ota_at INTEGER, ota_pending_version TEXT,

  autonomy_level TEXT NOT NULL DEFAULT 'SUPERVISED_AUTONOMY'
    CHECK (autonomy_level IN ('TELEOP_ONLY','ASSISTED','SUPERVISED_AUTONOMY','CONDITIONAL_AUTONOMY','FULL_AUTONOMY')),
  teleop_capable INTEGER NOT NULL DEFAULT 1,
  teleop_latency_budget_ms INTEGER DEFAULT 150,
  capability_tags TEXT CHECK (capability_tags IS NULL OR json_valid(capability_tags)),

  battery_soc_pct REAL, battery_soh_pct REAL, battery_cycles INTEGER,
  battery_serial TEXT, battery_temp_c REAL,
  charge_state TEXT DEFAULT 'DISCHARGING'
    CHECK (charge_state IN ('DISCHARGING','CHARGING','FULL','FAULT','SWAPPING')),
  est_runtime_min INTEGER, last_charge_completed_at INTEGER,
  hot_swap_batteries INTEGER NOT NULL DEFAULT 0,

  health_status TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (health_status IN ('NOMINAL','DEGRADED','FAULT','OFFLINE','UNKNOWN')),
  health_score INTEGER,
  active_fault_codes TEXT CHECK (active_fault_codes IS NULL OR json_valid(active_fault_codes)),
  last_heartbeat_at INTEGER, last_self_test_at INTEGER, self_test_result TEXT,
  comms_link TEXT, rssi_dbm INTEGER,
  free_storage_gb REAL, disk_write_mbps REAL, storage_health TEXT,

  odometer_m REAL NOT NULL DEFAULT 0,
  motor_hours REAL NOT NULL DEFAULT 0,
  power_on_hours REAL NOT NULL DEFAULT 0,
  mission_hours REAL NOT NULL DEFAULT 0,
  joint_cycle_counts TEXT CHECK (joint_cycle_counts IS NULL OR json_valid(joint_cycle_counts)),
  estop_count_lifetime INTEGER NOT NULL DEFAULT 0,
  hard_fault_count_30d INTEGER NOT NULL DEFAULT 0,
  last_duty_rollup_at INTEGER,

  calibration_status TEXT NOT NULL DEFAULT 'NEVER'
    CHECK (calibration_status IN ('VALID','EXPIRING','EXPIRED','INVALID','NEVER')),
  calibration_valid_until INTEGER,
  active_extrinsic_set_id TEXT,
  calibration_invalidated_reason TEXT,

  safety_class TEXT NOT NULL DEFAULT 'SC1_SUPERVISED',
  safety_review_status TEXT NOT NULL DEFAULT 'PENDING',
  safety_review_expires_at INTEGER,
  estop_type TEXT DEFAULT 'BOTH',
  estop_last_tested_at INTEGER, estop_test_interval_days INTEGER NOT NULL DEFAULT 30,
  speed_limit_mps_override REAL, requires_spotter INTEGER NOT NULL DEFAULT 0,

  active_rig_id TEXT, rig_mounted_at INTEGER, rig_locked INTEGER NOT NULL DEFAULT 0,

  availability_state TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (availability_state IN ('AVAILABLE','RESERVED','IN_RUN','CHARGING','MAINTENANCE','TRANSIT','OOS')),
  reserved_until INTEGER, current_run_id TEXT,
  min_turnaround_min INTEGER NOT NULL DEFAULT 30,
  max_daily_mission_hours REAL NOT NULL DEFAULT 6,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_robot_platform     ON robot(platform_id);
CREATE INDEX idx_robot_lab_state    ON robot(current_lab_id, lifecycle_state, availability_state);
CREATE INDEX idx_robot_health       ON robot(health_status, last_heartbeat_at);
CREATE INDEX idx_robot_cal_expiry   ON robot(calibration_status, calibration_valid_until);
CREATE INDEX idx_robot_rig          ON robot(active_rig_id);

CREATE TABLE robot_group (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  purpose TEXT, lab_id TEXT REFERENCES lab(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE robot_group_member (
  group_id TEXT NOT NULL REFERENCES robot_group(id) ON DELETE CASCADE,
  robot_id TEXT NOT NULL REFERENCES robot(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, robot_id)
);

CREATE TABLE charge_session (
  id TEXT PRIMARY KEY,
  robot_id TEXT NOT NULL REFERENCES robot(id) ON DELETE CASCADE,
  bay_id TEXT REFERENCES lab_bay(id),
  started_at INTEGER NOT NULL, ended_at INTEGER,
  soc_start REAL, soc_end REAL, energy_wh REAL,
  planned INTEGER NOT NULL DEFAULT 1, fault TEXT
);
CREATE INDEX idx_charge_robot ON charge_session(robot_id, started_at DESC);

-- ============ SENSORS & RIGS ============
CREATE TABLE sensor_model (
  id TEXT PRIMARY KEY,
  model_code TEXT NOT NULL UNIQUE, vendor TEXT, name TEXT NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('LIDAR_SPINNING','LIDAR_SOLID_STATE','CAMERA_RGB','CAMERA_STEREO','CAMERA_DEPTH','CAMERA_THERMAL','CAMERA_EVENT','IMU','GNSS','RADAR','TACTILE','FORCE_TORQUE','JOINT_ENCODER','MICROPHONE_ARRAY','WHEEL_ODOM','AUX_ENV')),
  spec TEXT CHECK (spec IS NULL OR json_valid(spec)),
  nominal_rate_hz REAL, min_rate_hz REAL,
  bandwidth_mbps_est REAL, power_w REAL, mass_g REAL,
  interface TEXT, 
  sync_capability TEXT NOT NULL DEFAULT 'SW_ONLY'
    CHECK (sync_capability IN ('PTP_HW','PPS_IN','HW_TRIGGER_IN','HW_TRIGGER_OUT','GENLOCK','SW_ONLY')),
  intrinsics_model TEXT NOT NULL DEFAULT 'NONE'
    CHECK (intrinsics_model IN ('PINHOLE_RADTAN','KANNALA_BRANDT','EQUIDISTANT','OMNI','NONE')),
  calibration_interval_days INTEGER NOT NULL DEFAULT 180,
  driver_package TEXT, firmware_min_version TEXT,
  default_topics TEXT CHECK (default_topics IS NULL OR json_valid(default_topics)),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE sensor (
  id TEXT PRIMARY KEY,
  sensor_model_id TEXT NOT NULL REFERENCES sensor_model(id),
  serial_number TEXT NOT NULL UNIQUE, asset_tag TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'SPARE'
    CHECK (status IN ('IN_SERVICE','SPARE','REPAIR','RMA','RETIRED')),
  health_status TEXT NOT NULL DEFAULT 'NOMINAL'
    CHECK (health_status IN ('NOMINAL','DEGRADED','FAULT','OFFLINE','UNKNOWN')),
  firmware_version TEXT,
  owning_lab_id TEXT REFERENCES lab(id),
  installed_rig_id TEXT, installed_slot_id TEXT, installed_at INTEGER,
  total_power_on_hours REAL NOT NULL DEFAULT 0,
  impact_flag INTEGER NOT NULL DEFAULT 0,
  last_intrinsic_calibration_id TEXT,
  intrinsics_valid_until INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_sensor_model  ON sensor(sensor_model_id, status);
CREATE INDEX idx_sensor_rig    ON sensor(installed_rig_id);
CREATE INDEX idx_sensor_cal    ON sensor(intrinsics_valid_until);

CREATE TABLE sensor_rig (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL, parent_rig_id TEXT REFERENCES sensor_rig(id),
  platform_id TEXT REFERENCES robot_platform(id),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','VALIDATING','VALIDATED','DEPRECATED')),
  base_frame_id TEXT NOT NULL DEFAULT 'base_link',
  urdf_fragment_uri TEXT,
  total_bandwidth_mbps REAL, total_power_w REAL, total_mass_g REAL,
  time_sync_profile_id TEXT,
  active_extrinsic_set_id TEXT,
  validated_at INTEGER, validated_by_operator_id TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (code, version)
);

CREATE TABLE sensor_rig_slot (
  id TEXT PRIMARY KEY,
  rig_id TEXT NOT NULL REFERENCES sensor_rig(id) ON DELETE CASCADE,
  slot_code TEXT NOT NULL,
  modality_required TEXT NOT NULL,
  sensor_model_id TEXT REFERENCES sensor_model(id),
  mount_point TEXT,
  nominal_xyz TEXT CHECK (nominal_xyz IS NULL OR json_valid(nominal_xyz)),
  nominal_rpy TEXT CHECK (nominal_rpy IS NULL OR json_valid(nominal_rpy)),
  frame_id TEXT NOT NULL,
  topics TEXT CHECK (topics IS NULL OR json_valid(topics)),
  sync_role TEXT NOT NULL DEFAULT 'FREE_RUNNING'
    CHECK (sync_role IN ('MASTER','SLAVE_PTP','SLAVE_PPS','TRIGGERED','FREE_RUNNING')),
  required INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  UNIQUE (rig_id, slot_code)
);
CREATE INDEX idx_slot_rig ON sensor_rig_slot(rig_id);

CREATE TABLE rig_assignment (
  id TEXT PRIMARY KEY,
  rig_id TEXT NOT NULL REFERENCES sensor_rig(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL REFERENCES sensor_rig_slot(id) ON DELETE CASCADE,
  sensor_id TEXT NOT NULL REFERENCES sensor(id),
  assigned_at INTEGER NOT NULL, removed_at INTEGER,
  assigned_by_operator_id TEXT, removal_reason TEXT
);
CREATE INDEX idx_rigassign_active ON rig_assignment(rig_id, removed_at);
CREATE INDEX idx_rigassign_sensor ON rig_assignment(sensor_id, assigned_at DESC);

CREATE TABLE extrinsic_set (
  id TEXT PRIMARY KEY,
  rig_id TEXT NOT NULL REFERENCES sensor_rig(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('TARGET_BOARD','TARGETLESS_MOTION','HAND_EYE','CAD_NOMINAL','MANUAL')),
  reference_frame TEXT NOT NULL,
  transforms TEXT NOT NULL CHECK (json_valid(transforms)),
  computed_at INTEGER NOT NULL, computed_by_operator_id TEXT,
  bundle_uri TEXT,
  residual_rms_px REAL, residual_rms_m REAL, reprojection_p95_px REAL,
  status TEXT NOT NULL DEFAULT 'CANDIDATE'
    CHECK (status IN ('CANDIDATE','ACTIVE','SUPERSEDED','REJECTED')),
  valid_from INTEGER, valid_until INTEGER,
  invalidated_at INTEGER, invalidated_reason TEXT,
  UNIQUE (rig_id, version)
);
CREATE INDEX idx_extrinsic_active ON extrinsic_set(rig_id, status, valid_until);

CREATE TABLE calibration_record (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('SENSOR','RIG','ROBOT')),
  subject_id TEXT NOT NULL,
  cal_type TEXT NOT NULL CHECK (cal_type IN ('INTRINSIC','EXTRINSIC','IMU_BIAS','IMU_NOISE','CAMERA_IMU_TIMESHIFT','WHEEL_ODOM','FT_ZERO','TIME_SYNC')),
  performed_at INTEGER NOT NULL,
  performed_by_operator_id TEXT,
  procedure_document_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('PASS','MARGINAL','FAIL')),
  metrics TEXT CHECK (metrics IS NULL OR json_valid(metrics)),
  artifact_uri TEXT,
  valid_until INTEGER,
  supersedes_id TEXT REFERENCES calibration_record(id),
  extrinsic_set_id TEXT REFERENCES extrinsic_set(id),
  notes TEXT
);
CREATE INDEX idx_cal_subject ON calibration_record(subject_type, subject_id, performed_at DESC);
CREATE INDEX idx_cal_expiry  ON calibration_record(valid_until);

CREATE TABLE time_sync_profile (
  id TEXT PRIMARY KEY,
  rig_id TEXT REFERENCES sensor_rig(id) ON DELETE CASCADE,
  topology TEXT NOT NULL CHECK (topology IN ('PTP_GRANDMASTER_ONBOARD','PTP_GM_GNSS','PPS_PLUS_NMEA','HW_TRIGGER_CHAIN','GENLOCK','SW_NTP_ONLY','MIXED')),
  grandmaster_source TEXT, ptp_domain INTEGER, ptp_profile TEXT,
  trigger_master_slot_id TEXT, trigger_rate_hz REAL,
  max_offset_ns_allowed INTEGER NOT NULL DEFAULT 1000000,
  max_pdv_ns INTEGER NOT NULL DEFAULT 250000,
  holdover_tolerance_s INTEGER NOT NULL DEFAULT 10,
  requires_gnss_lock INTEGER NOT NULL DEFAULT 0,
  clock_domain_map TEXT CHECK (clock_domain_map IS NULL OR json_valid(clock_domain_map)),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE time_sync_check (
  id TEXT PRIMARY KEY,
  robot_id TEXT NOT NULL REFERENCES robot(id) ON DELETE CASCADE,
  rig_id TEXT REFERENCES sensor_rig(id),
  run_id TEXT,
  checked_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('LOCKED','ACQUIRING','HOLDOVER','FREE_RUN','UNKNOWN')),
  master_offset_ns INTEGER, path_delay_ns INTEGER, pdv_ns_p95 INTEGER,
  gnss_fix_type TEXT, gnss_sats INTEGER, pps_present INTEGER,
  per_sensor_offsets TEXT CHECK (per_sensor_offsets IS NULL OR json_valid(per_sensor_offsets)),
  worst_pair_skew_ns INTEGER, worst_pair TEXT,
  verdict TEXT NOT NULL CHECK (verdict IN ('PASS','WARN','FAIL')),
  evidence_uri TEXT
);
CREATE INDEX idx_tsc_robot ON time_sync_check(robot_id, checked_at DESC);
CREATE INDEX idx_tsc_run   ON time_sync_check(run_id);

-- ============ PEOPLE ============
CREATE TABLE operator (
  id TEXT PRIMARY KEY,
  operator_code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT,
  role TEXT NOT NULL CHECK (role IN ('FIELD_OPERATOR','SAFETY_OFFICER','TECHNICIAN','CALIBRATION_SPECIALIST','DATA_ENGINEER','FLEET_MANAGER','ADMIN')),
  home_lab_id TEXT REFERENCES lab(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  code_number INTEGER,
  max_daily_hours REAL NOT NULL DEFAULT 8,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE certification_type (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('PLATFORM','GENERAL','SAFETY','CALIBRATION','LAB')),
  scope_id TEXT,
  levels TEXT CHECK (levels IS NULL OR json_valid(levels)),  -- ["L1","L2","L3"]
  validity_days INTEGER NOT NULL DEFAULT 365,
  requires_practical INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE operator_certification (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  certification_type_id TEXT NOT NULL REFERENCES certification_type(id),
  level TEXT, granted_at INTEGER NOT NULL, expires_at INTEGER,
  granted_by_operator_id TEXT, evidence_uri TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','SUSPENDED','REVOKED')),
  UNIQUE (operator_id, certification_type_id)
);
CREATE INDEX idx_opcert_expiry ON operator_certification(expires_at, status);

CREATE TABLE operator_availability (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('AVAILABLE','OOO','TRAINING','ON_CALL')),
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
  rrule TEXT, reason TEXT
);
CREATE INDEX idx_opavail ON operator_availability(operator_id, start_at, end_at);

-- ============ CAMPAIGN / MISSION CATALOG ============
CREATE TABLE campaign (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('PERCEPTION_DATA','MANIPULATION_DATA','NAV_BENCHMARK','REGRESSION_SUITE','ACCEPTANCE_TEST','ENDURANCE','CALIBRATION_SWEEP')),
  objective TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNING'
    CHECK (status IN ('PLANNING','ACTIVE','PAUSED','COMPLETED','CANCELLED')),
  target_usable_hours REAL, target_runs INTEGER,
  default_rig_id TEXT REFERENCES sensor_rig(id),
  allowed_platform_ids TEXT CHECK (allowed_platform_ids IS NULL OR json_valid(allowed_platform_ids)),
  pinned_stack_version TEXT,
  max_drop_rate_pct REAL NOT NULL DEFAULT 2.0,
  time_sync_tolerance_ns INTEGER NOT NULL DEFAULT 1000000,
  pii_required INTEGER NOT NULL DEFAULT 0,
  retention_days INTEGER NOT NULL DEFAULT 730,
  dataset_id TEXT,
  start_date TEXT, end_date TEXT,
  owner_operator_id TEXT REFERENCES operator(id),
  budget_hours REAL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE mission_group (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  name TEXT NOT NULL, order_index INTEGER NOT NULL DEFAULT 0, phase TEXT
);
CREATE INDEX idx_missiongroup_campaign ON mission_group(campaign_id, order_index);

CREATE TABLE mission (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  mission_group_id TEXT REFERENCES mission_group(id) ON DELETE SET NULL,
  mission_code TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','ACTIVE','PAUSED','RETIRED')),
  review_status TEXT NOT NULL DEFAULT 'PENDING',
  duration_type TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (duration_type IN ('SHORT','MEDIUM','LONG')),
  est_duration_min INTEGER,
  reps_target INTEGER NOT NULL DEFAULT 0,
  reps_attempted INTEGER NOT NULL DEFAULT 0,
  reps_usable INTEGER NOT NULL DEFAULT 0,
  schedule_status TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (schedule_status IN ('AVAILABLE','IN_PROGRESS','SATISFIED','BLOCKED')),
  instructions_complete INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  safety_approval TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (safety_approval IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED')),
  requires_legal_review INTEGER NOT NULL DEFAULT 0,
  legal_approval TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  sop_document_id TEXT,
  instructions TEXT CHECK (instructions IS NULL OR json_valid(instructions)),
  success_criteria TEXT CHECK (success_criteria IS NULL OR json_valid(success_criteria)),
  allowed_platform_ids TEXT CHECK (allowed_platform_ids IS NULL OR json_valid(allowed_platform_ids)),
  min_autonomy_level TEXT NOT NULL DEFAULT 'TELEOP_ONLY',
  max_safety_class_required TEXT NOT NULL DEFAULT 'SC1_SUPERVISED',
  required_capabilities TEXT CHECK (required_capabilities IS NULL OR json_valid(required_capabilities)),
  required_modalities TEXT CHECK (required_modalities IS NULL OR json_valid(required_modalities)),
  required_topics TEXT CHECK (required_topics IS NULL OR json_valid(required_topics)),
  required_lab_capabilities TEXT CHECK (required_lab_capabilities IS NULL OR json_valid(required_lab_capabilities)),
  required_certifications TEXT CHECK (required_certifications IS NULL OR json_valid(required_certifications)),
  requires_spotter INTEGER NOT NULL DEFAULT 0,
  robot_count INTEGER NOT NULL DEFAULT 1,
  robot_roles TEXT CHECK (robot_roles IS NULL OR json_valid(robot_roles)),
  env_conditions TEXT CHECK (env_conditions IS NULL OR json_valid(env_conditions)),
  teleop_required INTEGER NOT NULL DEFAULT 0,
  expected_bandwidth_mbps REAL, expected_bytes INTEGER,
  inventory_item_ids TEXT CHECK (inventory_item_ids IS NULL OR json_valid(inventory_item_ids)),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (campaign_id, mission_code)
);
CREATE INDEX idx_mission_sched ON mission(campaign_id, schedule_status, status);

CREATE TABLE mission_variant (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES mission(id) ON DELETE CASCADE,
  variant_code TEXT NOT NULL, name TEXT,
  parameters TEXT CHECK (parameters IS NULL OR json_valid(parameters)),
  weight REAL NOT NULL DEFAULT 1.0,
  reps_target INTEGER NOT NULL DEFAULT 0,
  reps_usable INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (mission_id, variant_code)
);

-- ============ RUNS ============
CREATE TABLE run (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaign(id),
  run_code TEXT UNIQUE, provisional_code TEXT, encoded_code TEXT, run_seq INTEGER,
  slot_date TEXT NOT NULL, slot_time TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60,
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN
    ('DRAFT','ASSEMBLING','READY','CONFIRMED','PREFLIGHT','IN_EXECUTION','RECORDING_COMPLETE',
     'UPLOADING','INGESTED','AUTO_QA','MANUAL_QA','VALIDATED','PUBLISHED',
     'ABORTED','SCRUBBED','QUARANTINED')),
  mission_scope TEXT NOT NULL DEFAULT 'CUSTOM' CHECK (mission_scope IN ('GROUP','CUSTOM','SINGLE')),
  mission_group_id TEXT REFERENCES mission_group(id),
  mission_ids TEXT CHECK (mission_ids IS NULL OR json_valid(mission_ids)),
  mission_reps TEXT CHECK (mission_reps IS NULL OR json_valid(mission_reps)),
  completed_mission_ids TEXT CHECK (completed_mission_ids IS NULL OR json_valid(completed_mission_ids)),
  effort_budget INTEGER NOT NULL DEFAULT 4,
  lab_id TEXT REFERENCES lab(id),
  bay_id TEXT REFERENCES lab_bay(id),
  operator_id TEXT REFERENCES operator(id),
  spotter_operator_id TEXT REFERENCES operator(id),
  robot_count INTEGER NOT NULL DEFAULT 1,
  rig_id TEXT REFERENCES sensor_rig(id),
  stack_version_snapshot TEXT,
  requires_gnss INTEGER NOT NULL DEFAULT 0,
  requires_teleop INTEGER NOT NULL DEFAULT 0,
  preflight_snapshot_id TEXT,
  override_applied INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER, ended_at INTEGER,
  bytes_recorded INTEGER NOT NULL DEFAULT 0,
  recorded_duration_s REAL NOT NULL DEFAULT 0,
  usable_duration_s REAL NOT NULL DEFAULT 0,
  yield_pct REAL,
  abort_reason TEXT, quarantine_reason TEXT, notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_run_slot     ON run(slot_date, slot_time);
CREATE INDEX idx_run_state    ON run(state, slot_date);
CREATE INDEX idx_run_bay      ON run(bay_id, slot_date, slot_time);
CREATE INDEX idx_run_operator ON run(operator_id, slot_date);
CREATE INDEX idx_run_campaign ON run(campaign_id, state);

CREATE TABLE run_robot (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  robot_id TEXT NOT NULL REFERENCES robot(id),
  role TEXT NOT NULL DEFAULT 'EGO' CHECK (role IN ('EGO','TRAFFIC','TARGET','FOLLOWER','OBSERVER')),
  rig_id TEXT REFERENCES sensor_rig(id),
  extrinsic_set_id TEXT REFERENCES extrinsic_set(id),
  readiness_snapshot_id TEXT,
  battery_soc_start REAL, battery_soc_end REAL,
  distance_m REAL, disengagements INTEGER NOT NULL DEFAULT 0, estops INTEGER NOT NULL DEFAULT 0,
  outcome TEXT CHECK (outcome IN ('OK','PARTIAL','FAILED','NO_SHOW')),
  UNIQUE (run_id, robot_id)
);
CREATE INDEX idx_runrobot_robot ON run_robot(robot_id);

CREATE TABLE mission_execution (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES mission(id),
  variant_id TEXT REFERENCES mission_variant(id),
  robot_id TEXT REFERENCES robot(id),
  rep_index INTEGER NOT NULL,
  started_at INTEGER, ended_at INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','RUNNING','SUCCESS','FAILED','ABORTED','INVALID')),
  failure_mode TEXT,
  disengagements INTEGER NOT NULL DEFAULT 0,
  intervention_seconds REAL NOT NULL DEFAULT 0,
  usable INTEGER NOT NULL DEFAULT 0,
  recording_segment_start_ns TEXT, recording_segment_end_ns TEXT,
  notes TEXT
);
CREATE INDEX idx_msexec_run     ON mission_execution(run_id);
CREATE INDEX idx_msexec_mission ON mission_execution(mission_id, usable);

CREATE TABLE run_event (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  robot_id TEXT REFERENCES robot(id),
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,          -- STATE_CHANGE, ESTOP, DISENGAGEMENT, FAULT, NOTE, RECORD_START, ...
  severity TEXT NOT NULL DEFAULT 'INFO',
  payload TEXT CHECK (payload IS NULL OR json_valid(payload)),
  actor_operator_id TEXT
);
CREATE INDEX idx_runevent ON run_event(run_id, at);

CREATE TABLE readiness_snapshot (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  robot_id TEXT REFERENCES robot(id),
  evaluated_at INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('SCHEDULE','PREFLIGHT','POSTRUN')),
  overall TEXT NOT NULL CHECK (overall IN ('PASS','PASS_WITH_OVERRIDE','FAIL')),
  gates TEXT NOT NULL CHECK (json_valid(gates)),
  overridden_by_operator_id TEXT, override_reason TEXT, approver_operator_id TEXT
);
CREATE INDEX idx_readiness_run ON readiness_snapshot(run_id, phase);

-- ============ DATAOPS ============
CREATE TABLE recording_artifact (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  robot_id TEXT NOT NULL REFERENCES robot(id),
  rig_id TEXT REFERENCES sensor_rig(id),
  extrinsic_set_id TEXT REFERENCES extrinsic_set(id),
  time_sync_check_id TEXT REFERENCES time_sync_check(id),
  format TEXT NOT NULL CHECK (format IN ('MCAP','ROSBAG2','MP4_SIDECAR','RAW_BIN')),
  r2_key TEXT NOT NULL UNIQUE,
  bytes INTEGER, sha256 TEXT,
  started_at_ns TEXT, ended_at_ns TEXT, duration_s REAL,
  topic_count INTEGER, message_count INTEGER,
  compression TEXT, chunk_index_present INTEGER NOT NULL DEFAULT 0,
  stack_git_sha TEXT, config_bundle_hash TEXT,
  upload_state TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (upload_state IN ('PENDING','UPLOADING','COMPLETE','FAILED')),
  upload_started_at INTEGER, upload_completed_at INTEGER,
  qa_status TEXT NOT NULL DEFAULT 'UNQA' CHECK (qa_status IN ('UNQA','PASS','WARN','FAIL')),
  retention_class TEXT NOT NULL DEFAULT 'RAW_HOT',
  pii_status TEXT NOT NULL DEFAULT 'UNSCANNED',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_rec_run   ON recording_artifact(run_id);
CREATE INDEX idx_rec_robot ON recording_artifact(robot_id, started_at_ns);
CREATE INDEX idx_rec_extr  ON recording_artifact(extrinsic_set_id);
CREATE INDEX idx_rec_qa    ON recording_artifact(qa_status, upload_state);

CREATE TABLE topic_coverage (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recording_artifact(id) ON DELETE CASCADE,
  topic TEXT NOT NULL, frame_id TEXT, slot_code TEXT, modality TEXT, schema_name TEXT,
  message_count INTEGER, expected_count INTEGER,
  mean_hz REAL, p05_hz REAL, max_gap_ms REAL, gap_count_over_2x INTEGER,
  dropped_est INTEGER, drop_rate_pct REAL,
  first_msg_ns TEXT, last_msg_ns TEXT,
  desync_ms_vs_reference REAL, desync_seconds_total REAL,
  payload_bytes INTEGER,
  verdict TEXT NOT NULL DEFAULT 'PASS' CHECK (verdict IN ('PASS','WARN','FAIL')),
  notes TEXT,
  UNIQUE (recording_id, topic)
);
CREATE INDEX idx_topiccov_verdict ON topic_coverage(recording_id, verdict);

CREATE TABLE qa_pipeline_run (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES run(id) ON DELETE CASCADE,
  recording_id TEXT REFERENCES recording_artifact(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('FIELD','AUTO','MANUAL','RELEASE')),
  started_at INTEGER, finished_at INTEGER,
  overall_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (overall_status IN ('PENDING','RUNNING','PASS','WARN','FAIL','ERROR')),
  gates TEXT CHECK (gates IS NULL OR json_valid(gates)),
  report_uri TEXT, reviewer_operator_id TEXT, review_notes TEXT
);
CREATE INDEX idx_qa_run ON qa_pipeline_run(run_id, level);

CREATE TABLE dataset (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  purpose TEXT, modality_mix TEXT CHECK (modality_mix IS NULL OR json_valid(modality_mix)),
  owner_operator_id TEXT REFERENCES operator(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE dataset_version (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'BUILDING'
    CHECK (status IN ('BUILDING','FROZEN','PUBLISHED','DEPRECATED','REVOKED')),
  manifest_uri TEXT, manifest_sha256 TEXT,
  member_count INTEGER, total_bytes INTEGER, total_duration_s REAL,
  split_policy TEXT CHECK (split_policy IS NULL OR json_valid(split_policy)),
  built_at INTEGER, built_by_operator_id TEXT,
  parent_version_id TEXT REFERENCES dataset_version(id),
  revoked_reason TEXT, notes TEXT,
  UNIQUE (dataset_id, version)
);

CREATE TABLE dataset_member (
  id TEXT PRIMARY KEY,
  dataset_version_id TEXT NOT NULL REFERENCES dataset_version(id) ON DELETE CASCADE,
  recording_id TEXT NOT NULL REFERENCES recording_artifact(id),
  start_ns TEXT, end_ns TEXT,
  split TEXT NOT NULL CHECK (split IN ('TRAIN','VAL','TEST','HOLDOUT')),
  label_job_id TEXT,
  weight REAL NOT NULL DEFAULT 1.0,
  exclusion_reason TEXT
);
CREATE INDEX idx_dsmember_version ON dataset_member(dataset_version_id, split);
CREATE INDEX idx_dsmember_rec     ON dataset_member(recording_id);

CREATE TABLE label_job (
  id TEXT PRIMARY KEY,
  dataset_version_id TEXT REFERENCES dataset_version(id),
  run_id TEXT REFERENCES run(id),
  vendor TEXT, task_type TEXT NOT NULL,
  spec_document_id TEXT, input_manifest_uri TEXT, output_uri TEXT,
  frame_count INTEGER, sampling_rule TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','IN_PROGRESS','IN_REVIEW','DELIVERED','REJECTED')),
  cost_estimate_usd REAL, delivered_at INTEGER,
  qa_sample_pct REAL, agreement_score REAL, rejected_reason TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

-- ============ MAINTENANCE & PARTS ============
CREATE TABLE service_interval (
  id TEXT PRIMARY KEY,
  platform_id TEXT REFERENCES robot_platform(id) ON DELETE CASCADE,
  sensor_model_id TEXT REFERENCES sensor_model(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('PREVENTIVE','INSPECTION','CALIBRATION','CONSUMABLE','SAFETY')),
  interval_days INTEGER, interval_odometer_m REAL, interval_motor_hours REAL,
  interval_power_on_hours REAL,
  interval_joint_cycles TEXT CHECK (interval_joint_cycles IS NULL OR json_valid(interval_joint_cycles)),
  warn_at_pct INTEGER NOT NULL DEFAULT 80,
  blocking INTEGER NOT NULL DEFAULT 0,
  est_labor_min INTEGER, sop_document_id TEXT,
  required_parts TEXT CHECK (required_parts IS NULL OR json_valid(required_parts)),
  required_cert_id TEXT REFERENCES certification_type(id)
);

CREATE TABLE maintenance_due (
  id TEXT PRIMARY KEY,
  robot_id TEXT NOT NULL REFERENCES robot(id) ON DELETE CASCADE,
  interval_id TEXT NOT NULL REFERENCES service_interval(id) ON DELETE CASCADE,
  basis TEXT, pct_consumed REAL NOT NULL DEFAULT 0,
  due_at_estimate TEXT,
  status TEXT NOT NULL DEFAULT 'OK' CHECK (status IN ('OK','WARN','DUE','OVERDUE','WAIVED')),
  blocking INTEGER NOT NULL DEFAULT 0,
  last_serviced_at INTEGER,
  last_serviced_counters TEXT CHECK (last_serviced_counters IS NULL OR json_valid(last_serviced_counters)),
  work_order_id TEXT,
  computed_at INTEGER NOT NULL,
  UNIQUE (robot_id, interval_id)
);
CREATE INDEX idx_mdue_status ON maintenance_due(status, blocking, due_at_estimate);

CREATE TABLE work_order (
  id TEXT PRIMARY KEY, wo_code TEXT UNIQUE,
  robot_id TEXT REFERENCES robot(id), sensor_id TEXT REFERENCES sensor(id),
  lab_id TEXT REFERENCES lab(id),
  wo_type TEXT NOT NULL CHECK (wo_type IN ('PREVENTIVE','CORRECTIVE','UPGRADE','CALIBRATION','RMA','INSPECTION')),
  priority TEXT NOT NULL DEFAULT 'P3' CHECK (priority IN ('P1','P2','P3','P4')),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','SCHEDULED','IN_PROGRESS','WAITING_PARTS','BLOCKED','DONE','CANCELLED')),
  opened_at INTEGER NOT NULL, opened_by_operator_id TEXT,
  scheduled_start INTEGER, scheduled_end INTEGER, completed_at INTEGER,
  assigned_operator_id TEXT REFERENCES operator(id),
  blocks_operation INTEGER NOT NULL DEFAULT 1,
  invalidates_calibration INTEGER NOT NULL DEFAULT 0,
  downtime_min INTEGER, labor_min INTEGER,
  symptom TEXT, root_cause TEXT, resolution TEXT,
  incident_id TEXT, maintenance_due_id TEXT,
  cost_parts_usd REAL, cost_labor_usd REAL
);
CREATE INDEX idx_wo_robot  ON work_order(robot_id, status);
CREATE INDEX idx_wo_window ON work_order(scheduled_start, scheduled_end, blocks_operation);

CREATE TABLE part_catalog (
  id TEXT PRIMARY KEY, part_number TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  category TEXT,
  compatible_platform_ids TEXT CHECK (compatible_platform_ids IS NULL OR json_valid(compatible_platform_ids)),
  compatible_sensor_model_ids TEXT CHECK (compatible_sensor_model_ids IS NULL OR json_valid(compatible_sensor_model_ids)),
  is_consumable INTEGER NOT NULL DEFAULT 0, serialized INTEGER NOT NULL DEFAULT 0,
  expected_life_hours REAL, unit_cost_usd REAL, lead_time_days INTEGER,
  supplier TEXT, min_stock INTEGER NOT NULL DEFAULT 0, reorder_point INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE part_stock (
  id TEXT PRIMARY KEY,
  part_id TEXT NOT NULL REFERENCES part_catalog(id) ON DELETE CASCADE,
  lab_id TEXT NOT NULL REFERENCES lab(id) ON DELETE CASCADE,
  qty_on_hand INTEGER NOT NULL DEFAULT 0,
  qty_reserved INTEGER NOT NULL DEFAULT 0,
  qty_on_order INTEGER NOT NULL DEFAULT 0,
  bin_location TEXT, last_counted_at INTEGER,
  UNIQUE (part_id, lab_id)
);
CREATE INDEX idx_partstock_low ON part_stock(lab_id, qty_on_hand);

CREATE TABLE part_installation (
  id TEXT PRIMARY KEY,
  part_id TEXT NOT NULL REFERENCES part_catalog(id),
  serial_number TEXT,
  robot_id TEXT REFERENCES robot(id), sensor_id TEXT REFERENCES sensor(id),
  work_order_id TEXT REFERENCES work_order(id),
  installed_at INTEGER NOT NULL, removed_at INTEGER,
  hours_at_install REAL, hours_at_removal REAL, failure_mode TEXT
);
CREATE INDEX idx_partinst_robot ON part_installation(robot_id, removed_at);

CREATE TABLE incident (
  id TEXT PRIMARY KEY, incident_code TEXT UNIQUE,
  occurred_at INTEGER NOT NULL,
  robot_id TEXT REFERENCES robot(id), run_id TEXT REFERENCES run(id),
  lab_id TEXT REFERENCES lab(id), operator_id TEXT REFERENCES operator(id),
  severity TEXT NOT NULL CHECK (severity IN ('NEAR_MISS','MINOR','MAJOR','CRITICAL')),
  category TEXT NOT NULL,
  description TEXT NOT NULL, immediate_action TEXT,
  robot_quarantined INTEGER NOT NULL DEFAULT 0,
  calibration_invalidated INTEGER NOT NULL DEFAULT 0,
  reported_by_operator_id TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','INVESTIGATING','CORRECTIVE_ACTION','CLOSED')),
  root_cause TEXT,
  corrective_actions TEXT CHECK (corrective_actions IS NULL OR json_valid(corrective_actions)),
  closed_at INTEGER, regulatory_reportable INTEGER NOT NULL DEFAULT 0,
  artifact_uris TEXT CHECK (artifact_uris IS NULL OR json_valid(artifact_uris))
);
CREATE INDEX idx_incident_robot ON incident(robot_id, occurred_at DESC);
CREATE INDEX idx_incident_open  ON incident(status, severity);

CREATE TABLE known_issue (
  id TEXT PRIMARY KEY, issue_code TEXT UNIQUE, title TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('PLATFORM','SENSOR_MODEL','STACK_VERSION','FIRMWARE')),
  scope_id TEXT, symptom TEXT,
  detection_signature TEXT CHECK (detection_signature IS NULL OR json_valid(detection_signature)),
  workaround TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','MITIGATED','FIXED')),
  fixed_in_version TEXT,
  affected_robot_ids TEXT CHECK (affected_robot_ids IS NULL OR json_valid(affected_robot_ids)),
  severity TEXT, first_seen_at INTEGER, occurrence_count INTEGER NOT NULL DEFAULT 0
);

-- ============ SCHEDULING WINDOWS, ALERTS, METRICS ============
CREATE TABLE availability_window (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('ROBOT','BAY','LAB','OPERATOR')),
  subject_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('RESERVED','CHARGE','MAINTENANCE','TRANSIT','BLACKOUT','TRAINING')),
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
  run_id TEXT REFERENCES run(id) ON DELETE CASCADE,
  work_order_id TEXT REFERENCES work_order(id) ON DELETE CASCADE,
  reason TEXT
);
CREATE INDEX idx_availwin ON availability_window(subject_type, subject_id, start_at, end_at);

CREATE TABLE alert_rule (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  scope_type TEXT NOT NULL, scope_id TEXT,
  metric TEXT NOT NULL, comparator TEXT NOT NULL CHECK (comparator IN ('LT','LTE','GT','GTE','EQ','NE')),
  threshold REAL NOT NULL, window_s INTEGER NOT NULL DEFAULT 60,
  severity TEXT NOT NULL DEFAULT 'WARN' CHECK (severity IN ('INFO','WARN','CRITICAL')),
  enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_s INTEGER NOT NULL DEFAULT 900,
  notify_channels TEXT CHECK (notify_channels IS NULL OR json_valid(notify_channels))
);

CREATE TABLE alert (
  id TEXT PRIMARY KEY,
  rule_id TEXT REFERENCES alert_rule(id),
  robot_id TEXT REFERENCES robot(id), sensor_id TEXT REFERENCES sensor(id),
  lab_id TEXT REFERENCES lab(id), run_id TEXT REFERENCES run(id),
  raised_at INTEGER NOT NULL, cleared_at INTEGER,
  severity TEXT NOT NULL, metric TEXT, observed REAL, threshold REAL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ACKED','CLEARED','SUPPRESSED')),
  acked_by_operator_id TEXT, acked_at INTEGER,
  known_issue_id TEXT REFERENCES known_issue(id)
);
CREATE INDEX idx_alert_active ON alert(status, severity, raised_at DESC);
CREATE INDEX idx_alert_robot  ON alert(robot_id, raised_at DESC);

CREATE TABLE fleet_metric_daily (
  id TEXT PRIMARY KEY,
  metric_date TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('ROBOT','PLATFORM','LAB','FLEET')),
  scope_id TEXT,
  mission_hours REAL, available_hours REAL, downtime_min INTEGER,
  availability_pct REAL, utilization_pct REAL,
  failures INTEGER, mtbf_hours REAL, mttr_min REAL,
  distance_m REAL, disengagements INTEGER, estops INTEGER,
  bytes_recorded INTEGER, bytes_promoted INTEGER,
  usable_duration_s REAL, recorded_duration_s REAL, yield_pct REAL,
  calibration_compliance_pct REAL, cost_per_usable_hour_usd REAL,
  UNIQUE (metric_date, scope_type, scope_id)
);
CREATE INDEX idx_fmd_scope ON fleet_metric_daily(scope_type, scope_id, metric_date DESC);

-- Retained from Gala
CREATE TABLE inventory_item (
  id TEXT PRIMARY KEY, campaign_id TEXT REFERENCES campaign(id) ON DELETE CASCADE,
  lab_id TEXT REFERENCES lab(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('PROP','FIXTURE','CAL_TARGET','CONSUMABLE','TOOL','PAYLOAD')),
  quantity REAL NOT NULL DEFAULT 0, unit TEXT,
  status TEXT NOT NULL DEFAULT 'AVAILABLE', notes TEXT
);

CREATE TABLE document (
  id TEXT PRIMARY KEY, doc_type TEXT NOT NULL, title TEXT NOT NULL,
  scope_type TEXT, scope_id TEXT,
  r2_key TEXT, version TEXT, effective_at INTEGER, expires_at INTEGER,
  vectorize_id TEXT, checksum TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_doc_scope ON document(scope_type, scope_id, doc_type);
```

### Deferred FKs
`robot.active_rig_id`, `robot.active_extrinsic_set_id`, `sensor_rig.active_extrinsic_set_id`, `sensor_rig.time_sync_profile_id`, `run.preflight_snapshot_id`, `campaign.dataset_id` are intentionally declared without inline `REFERENCES` to avoid circular-creation ordering problems in D1 migrations; enforce them in application code or add them in a later migration once all tables exist.

---

## 9. API surface

Base: `/api/v1`. Auth: session cookie for the web app, bearer/mTLS device token for robot agents (`/api/v1/agent/*` is a separate, narrower surface). All list endpoints support `?limit&cursor&sort&q` and resource-specific filters.

### Fleet — robots
```
GET    /robots                          ?lab_id&platform_id&lifecycle_state&health_status&available_at
POST   /robots
GET    /robots/{id}
PATCH  /robots/{id}
GET    /robots/{id}/status               -> live snapshot (KV, falls back to DO)
GET    /robots/{id}/telemetry            ?metric&from&to&bucket  (Analytics Engine)
GET    /robots/{id}/readiness            ?run_id  -> full gate evaluation, no side effects
POST   /robots/{id}/lifecycle            {to_state, reason}
POST   /robots/{id}/quarantine           {reason, incident_id}
POST   /robots/{id}/release-quarantine   {approver_operator_id, notes}
GET    /robots/{id}/duty                 -> counters + projected service dates
POST   /robots/{id}/rig                  {rig_id}  -> mount rig (invalidates extrinsics)
DELETE /robots/{id}/rig                  -> unmount
GET    /robots/{id}/runs                 ?state&from&to
GET    /robots/{id}/maintenance          -> maintenance_due rows + open work orders
GET    /robots/{id}/incidents
POST   /robots/{id}/commands             {command, params}  -> via RobotActor DO (estop, self_test, start_record, stop_record, ota)
GET    /robots/{id}/stream               -> WebSocket upgrade to RobotActor
GET    /platforms  POST /platforms  GET/PATCH /platforms/{id}
GET    /robot-groups ...
```

### Sensors, rigs, calibration
```
GET/POST /sensor-models          GET/PATCH /sensor-models/{id}
GET/POST /sensors                ?modality&status&lab_id      GET/PATCH /sensors/{id}
POST   /sensors/{id}/impact                {occurred_at, magnitude_g}  -> sets impact_flag, invalidates cal
GET    /sensors/{id}/calibrations
GET/POST /rigs                   ?platform_id&status
GET    /rigs/{id}                -> rig + slots + current assignments + extrinsics + sync profile
POST   /rigs/{id}/clone          {new_version_note} -> new version, DRAFT
GET/POST/PATCH/DELETE /rigs/{id}/slots[/{slot_id}]
PUT    /rigs/{id}/slots/{slot_id}/sensor   {sensor_id}   -> creates RigAssignment; forces VALIDATING
DELETE /rigs/{id}/slots/{slot_id}/sensor
POST   /rigs/{id}/validate       -> runs bandwidth/power/mass/sync-topology checks, sets VALIDATED
GET    /rigs/{id}/bandwidth-check
GET/POST /rigs/{id}/extrinsic-sets
POST   /extrinsic-sets/{id}/activate      {valid_until}
POST   /extrinsic-sets/{id}/reject        {reason}   -> cascades: revoke affected DatasetVersions
GET/POST /calibrations           ?subject_type&subject_id&cal_type&result
GET    /calibrations/expiring    ?within_days=14      -> the scheduler's calibration work queue
GET/PUT  /rigs/{id}/time-sync-profile
POST   /robots/{id}/time-sync-check       -> triggers live check via DO, persists TimeSyncCheck
GET    /time-sync-checks         ?robot_id&run_id&verdict
```

### Facilities & people
```
GET/POST /labs   GET/PATCH /labs/{id}
GET/POST /labs/{id}/bays   GET/PATCH /bays/{id}
GET    /bays/{id}/schedule      ?from&to
GET/POST/DELETE /blackouts
GET/POST /operators   GET/PATCH /operators/{id}
GET/POST /operators/{id}/certifications     POST /certifications/{id}/renew
GET    /operators/{id}/availability   POST /operators/{id}/availability
GET    /certification-types
GET    /operators/qualified     ?platform_id&mission_id&at   -> candidate operators for a run
```

### Campaigns & missions
```
GET/POST /campaigns   GET/PATCH /campaigns/{id}
GET    /campaigns/{id}/progress          -> usable vs target, per mission & variant, burn-down
GET/POST /campaigns/{id}/mission-groups
GET/POST /campaigns/{id}/missions        ?schedule_status&is_approved
GET/PATCH /missions/{id}
GET    /missions/{id}/readiness          -> Layer A + B gate detail
POST   /missions/{id}/approve            {kind: SAFETY|LEGAL|REVIEW, decision, notes}
GET/POST /missions/{id}/variants   PATCH /variants/{id}
GET    /missions/{id}/eligible-robots    ?at
```

### Runs & scheduling
```
GET/POST /runs                   ?state&campaign_id&lab_id&bay_id&robot_id&from&to
GET/PATCH /runs/{id}
POST   /runs/{id}/robots         {robot_id, role}        DELETE /runs/{id}/robots/{robot_id}
POST   /runs/{id}/assemble       -> auto-pack missions into effort budget
GET    /runs/{id}/readiness      ?phase=SCHEDULE|PREFLIGHT
POST   /runs/{id}/confirm        -> reserves robots/bay/operator atomically (BayScheduler DO)
POST   /runs/{id}/preflight      -> Layer D evaluation, writes ReadinessSnapshot
POST   /runs/{id}/override       {gate_code, reason, approver_operator_id}
POST   /runs/{id}/start          -> RunCoordinator DO; fails if !is_launchable and no override
POST   /runs/{id}/abort          {reason}
POST   /runs/{id}/complete
GET    /runs/{id}/events         ?since        (SSE variant: /runs/{id}/events/stream)
GET/POST /runs/{id}/executions   PATCH /executions/{id}
GET    /runs/{id}/artifacts
GET    /runs/{id}/qa
POST   /runs/{id}/qa/{level}/decision   {status, notes}
POST   /runs/{id}/quarantine     {reason}
POST   /schedule/auto            {campaign_id, date_range, labs[], max_runs}  -> proposed runs (dry-run by default)
GET    /schedule/conflicts       ?from&to&lab_id
GET    /schedule/calendar        ?from&to&view=bay|robot|operator
GET    /schedule/availability    ?robot_id|bay_id|operator_id&from&to
```

### DataOps
```
POST   /agent/recordings/init            {run_id, robot_id, ...} -> presigned R2 multipart URLs
POST   /agent/recordings/{id}/complete   {parts[], sha256, stats}
GET    /recordings                       ?run_id&robot_id&qa_status&upload_state
GET    /recordings/{id}                  -> artifact + topic coverage + QA
GET    /recordings/{id}/download         -> presigned GET
POST   /recordings/{id}/reprocess        -> re-enqueue dataops workflow
GET    /recordings/{id}/coverage
GET/POST /datasets   GET/PATCH /datasets/{id}
GET/POST /datasets/{id}/versions
POST   /dataset-versions/{id}/build      {selector}   -> evaluates promotion gates, writes members
GET    /dataset-versions/{id}/promotion-report   -> per-candidate gate pass/fail with reasons
POST   /dataset-versions/{id}/freeze     POST /dataset-versions/{id}/publish
POST   /dataset-versions/{id}/revoke     {reason}
GET    /dataset-versions/{id}/lineage    -> runs, robots, rigs, extrinsic sets, sw versions
GET    /recordings/{id}/lineage          -> reverse: which dataset versions include this
GET/POST /label-jobs   PATCH /label-jobs/{id}
POST   /label-jobs/{id}/deliver          {output_uri, agreement_score}
```

### Maintenance, parts, incidents
```
GET    /maintenance/due                  ?status&lab_id&blocking
POST   /maintenance/recompute            (also a cron trigger)
GET/POST /service-intervals
GET/POST /work-orders                    ?robot_id&status&priority
GET/PATCH /work-orders/{id}
POST   /work-orders/{id}/status          {status, notes}
POST   /work-orders/{id}/parts           {part_id, qty, serial}
GET/POST /parts                          GET/PATCH /parts/{id}
GET    /parts/stock                      ?lab_id&below_reorder=true
POST   /parts/stock/adjust               {part_id, lab_id, delta, reason}
GET/POST /incidents   GET/PATCH /incidents/{id}   POST /incidents/{id}/close
GET/POST /known-issues                   POST /known-issues/{id}/match  (test a signature)
```

### Ops / telemetry / briefing (LabOps carryover)
```
POST   /agent/telemetry                  (robot agent; batched; -> Queue)
POST   /agent/heartbeat
POST   /agent/events                     {estop, fault, disengagement, ...}
GET    /fleet/status                     ?lab_id   -> KV-backed roll-up
GET    /fleet/metrics                    ?scope_type&scope_id&from&to
GET    /alerts                           ?status&severity   POST /alerts/{id}/ack
GET/POST /alert-rules
GET    /briefing/daily                   ?lab_id&date  -> generated: status, blocking gates, due maintenance, expiring calibrations/certs, open incidents, today's runs, low stock
GET    /docs/search                      ?q  -> Vectorize SOP search
GET/POST /documents
```

**Webhook / event surface (outbound):** `run.state_changed`, `robot.health_changed`, `robot.quarantined`, `calibration.invalidated`, `alert.raised`, `recording.qa_completed`, `dataset_version.published`, `dataset_version.revoked`.

---

## 10. Realistic dummy-data plan

All names below are fictional. Keep the seed deterministic (fixed uuidv7 seeds) so tests can assert against it.

### 10.1 Labs (3) and bays (8)

| Lab | Code | Type | Bays |
|---|---|---|---|
| Fennel Street Arena | `LAB-FEN` | `INDOOR_ARENA` | `FEN-A1` open floor 20×12 m SC2 (mocap, PTP GM, charging×4); `FEN-A2` open floor 12×8 m SC1 (ramp 15°); `FEN-CAL` calibration room SC0 (target boards, no charging) |
| Kelp Yard | `LAB-KLP` | `OUTDOOR_YARD` | `KLP-PAD1` outdoor pad, GNSS sky view, RTK base, SC2 (rain rig); `KLP-PAD2` gravel/mixed-surface pad SC2 |
| Marrow Works | `LAB-MRW` | `MANIPULATION_CELL` | `MRW-C1` caged cell SC0 (force plate, bin fixtures); `MRW-C2` caged cell SC0; `MRW-BENCH` tabletop SC0 |

Lab capabilities: `LAB-FEN` → `["motion_capture","ptp_grandmaster","obstacle_kit","low_light_rig"]`; `LAB-KLP` → `["gnss_skyview","rtk_base","rain_rig","mixed_surface","incline_20deg"]`; `LAB-MRW` → `["force_plate","bin_picking_fixtures","conveyor_mock"]`.

### 10.2 Platforms (3)

| Code | Name | Morphology | Notes |
|---|---|---|---|
| `QDX-4` | Quadris DX-4 | `QUADRUPED` | 32 kg, 1.6 m/s, 2.1 kWh, 95 min runtime, 60 min charge, no hot-swap, 1200 Mbps record ceiling, 4 TB NVMe, `max_daily_mission_hours` 4 |
| `AMR-T2` | Tessellate T2 | `AMR_TOTE` (wheeled diff) | 110 kg, 1.8 m/s, hot-swap packs, 45 min charge, 800 Mbps ceiling, 2 TB |
| `ARM-P6` | Palisade P6 | `ARM_FIXED` (6-DoF) | mains powered (`battery_capacity_wh` NULL → battery gate auto-passes), 400 Mbps, joint-cycle-based service intervals |

### 10.3 Robots (11)

| Asset tag | Call sign | Platform | Lab | Lifecycle | Notes for seed realism |
|---|---|---|---|---|---|
| `QDX-4-001` | Bramble | QDX-4 | FEN | ACTIVE | healthy, calibration valid 41 d, SoC 92 %, 340 mission hours |
| `QDX-4-002` | Cinder | QDX-4 | FEN | ACTIVE | `calibration_status='EXPIRING'` (4 d left) — demonstrates the look-ahead block |
| `QDX-4-003` | Dovetail | QDX-4 | KLP | RESTRICTED | teleop-only after autonomy regression `KI-014`; `restricted_mission_tags:["autonomy"]` |
| `QDX-4-004` | Ember | QDX-4 | FEN | MAINTENANCE | open P2 work order: knee actuator replacement, `WAITING_PARTS` |
| `QDX-4-005` | Foxglove | QDX-4 | KLP | ACTIVE | `battery_soh_pct=71` — one point above the 70 % floor; battery replacement due |
| `AMR-T2-101` | Grommet | AMR-T2 | FEN | ACTIVE | highest utilization, 1,840 km odometer |
| `AMR-T2-102` | Halyard | AMR-T2 | FEN | ACTIVE | `config_drift=1` (pending stack rollout) — soft gate demo |
| `AMR-T2-103` | Ironwood | AMR-T2 | KLP | QUARANTINED | incident `INC-2026-014` shelf collision; calibration invalidated |
| `AMR-T2-104` | Juniper | AMR-T2 | KLP | ACTIVE | healthy |
| `ARM-P6-201` | Kestrel | ARM-P6 | MRW | ACTIVE | 1.2 M joint cycles on J3, 84 % of interval |
| `ARM-P6-202` | Larkspur | ARM-P6 | MRW | COMMISSIONING | never calibrated (`calibration_status='NEVER'`) — shows the hard block |

### 10.4 Sensor models (10) and rigs (4)

Sensor models: `LX-64R` (spinning LiDAR, 64ch, 10 Hz, PTP_HW, 240 Mbps), `LX-S1` (solid-state), `CV-2M-G` (2 MP global-shutter RGB, 30 fps, HW_TRIGGER_IN, 90 Mbps), `CV-5M-R` (5 MP rolling shutter), `ST-B120` (stereo pair, 120 mm baseline, genlock), `DP-T400` (ToF depth), `TH-640` (thermal 640×512, radiometric), `IM-9A` (IMU, 400 Hz, PPS_IN), `GN-RTK2` (GNSS RTK), `FT-6X` (6-axis force-torque, 1 kHz), `MC-4A` (4-mic array).

| Rig | Code / version | Platform | Slots |
|---|---|---|---|
| Urban Perception A | `RIG-URB-A` v3 | QDX-4 | `head_lidar` LX-64R (MASTER), `head_cam_l`/`head_cam_r` CV-2M-G (TRIGGERED), `chin_thermal` TH-640, `body_imu` IM-9A (SLAVE_PPS), `mast_gnss` GN-RTK2 — total 512 Mbps, `PTP_GM_GNSS`, `max_offset_ns_allowed=500000` |
| Warehouse Nav B | `RIG-WHS-B` v2 | AMR-T2 | `front_lidar` LX-S1, `front_stereo` ST-B120 (genlock), `rear_cam` CV-5M-R, `chassis_imu` IM-9A — 380 Mbps, `HW_TRIGGER_CHAIN` |
| Manipulation Cell C | `RIG-MAN-C` v1 | ARM-P6 | `wrist_cam` CV-2M-G, `wrist_depth` DP-T400, `wrist_ft` FT-6X, `overhead_cam` CV-5M-R, `cell_mic` MC-4A — 260 Mbps, `PTP_GRANDMASTER_ONBOARD` |
| Calibration Reference | `RIG-CAL-REF` v1 | (any) | target-board fixture rig, `status='VALIDATED'`, used only by calibration missions |

Seed one `RIG-URB-A` v3 `ExtrinsicSet` with `residual_rms_px=0.28`, `reprojection_p95_px=0.61`, `status='ACTIVE'`, `valid_until` = today + 60 d; and one `RIG-WHS-B` v2 set with `status='REJECTED'`, `invalidated_reason='SENSOR_SWAP'`, linked to Ironwood's incident — so the lineage/revocation path has data.

### 10.5 Operators (7) and certifications

| Code | Name | Role | Home | Certs |
|---|---|---|---|---|
| `OP-001` | R. Vasquez-Thorne | FLEET_MANAGER | FEN | `LEGGED-L3`, `SAFETY-OFFICER`, `AMR-L2` |
| `OP-002` | K. Odundo | FIELD_OPERATOR | FEN | `LEGGED-L2`, `AMR-L2` |
| `OP-003` | M. Lindqvist | FIELD_OPERATOR | KLP | `AMR-L3`, `OUTDOOR-RTK` — `LEGGED-L1` **expires in 9 days** (renewal-alert demo) |
| `OP-004` | T. Baptiste | CALIBRATION_SPECIALIST | FEN | `CAL-EXTRINSIC-L3`, `CAL-INTRINSIC-L3` |
| `OP-005` | A. Ferreira-Nkemdi | TECHNICIAN | MRW | `ARM-L3`, `ELEC-SAFETY` |
| `OP-006` | J. Wray | SAFETY_OFFICER | KLP | `SAFETY-OFFICER`, `AMR-L1` |
| `OP-007` | S. Halvorsen | DATA_ENGINEER | FEN | (no operating certs — must be blocked from being assigned as run operator) |

Availability: OP-002 OOO for 3 days next week; OP-005 training block Thursday afternoons (rrule weekly).

### 10.6 Campaigns and mission catalog

**Campaign `CMP-URB-01` — "Urban Sidewalk Perception, Winter"** (`PERCEPTION_DATA`, target 120 usable hours, default rig `RIG-URB-A`, platforms `[QDX-4]`, `max_drop_rate_pct=1.5`, `time_sync_tolerance_ns=500000`, `pii_required=1`).
Mission groups: `BASELINE`, `LOW_LIGHT`, `PRECIPITATION`.
Missions:
- `URB-001` "Sidewalk traverse, dry, daylight" — MEDIUM, reps_target 40, LOW risk, approved, variants `SPD-SLOW`/`SPD-NOMINAL`/`SPD-FAST`.
- `URB-004` "Curb ramp descent with pedestrian crossing" — LONG, reps_target 24, HIGH risk, `safety_approval='APPROVED'`, `requires_spotter=1`, `required_certifications:["LEGGED-L2","SAFETY-OFFICER"]`, `robot_count=2` (roles EGO + TRAFFIC using an AMR-T2).
- `URB-007` "Low-light stairwell approach" — MEDIUM, reps_target 30, `required_lab_capabilities:["low_light_rig"]`, `instructions_complete=0` → **not approved**, good "why is this blocked?" example.
- `URB-011` "Rain-rig traverse" — LONG, reps_target 16, `required_lab_capabilities:["rain_rig"]` → only `KLP-PAD1` qualifies.

**Campaign `CMP-WHS-02` — "Warehouse Aisle Navigation Regression"** (`REGRESSION_SUITE`, `pinned_stack_version='nav-3.7.2'`, platforms `[AMR-T2]`, rig `RIG-WHS-B`). Missions `WHS-001` aisle traverse (SHORT, 60 reps), `WHS-002` blocked-aisle re-plan (MEDIUM, 30), `WHS-005` human-crossing yield (MEDIUM, 24, HIGH risk, spotter).

**Campaign `CMP-MAN-03` — "Bin Picking Force Profiles"** (`MANIPULATION_DATA`, rig `RIG-MAN-C`). Missions `MAN-001` single-item grasp (SHORT, 200 reps, variants by object class `SOFT`/`RIGID`/`DEFORMABLE`), `MAN-004` cluttered-bin extraction (MEDIUM, 80).

**Campaign `CMP-CAL-00` — "Standing Calibration"** (`CALIBRATION_SWEEP`, ongoing). Missions `CAL-EXT-QDX` and `CAL-INT-CAM`, auto-proposed by the scheduler when calibration expiry is within 14 days.

### 10.7 Historical runs (~45 over the last 6 weeks)

Distribution designed to exercise every state and gate:
- **28 `PUBLISHED`** — full happy path: 2–4 recordings each, topic coverage all `PASS`, yield 0.88–0.98, promoted into `ds-urban-sidewalk` v1/v2.
- **5 `VALIDATED`** — QA passed, awaiting dataset build.
- **3 `MANUAL_QA`** — AutoQA returned `WARN` (e.g. `RUN-2026-0031`: `/camera/head_left` drop_rate 3.1 % with a 4.2 s burst gap at t+312 s).
- **2 `QUARANTINED`** — `RUN-2026-0019` and `-0022` used the rejected `RIG-WHS-B` v2 extrinsic set; both cascade-revoked `ds-warehouse-nav` v3.
- **2 `ABORTED`** — one `abort_reason='TIME_SYNC_LOST'` (PTP dropped to `FREE_RUN` at t+95 s, 41 s of `DESYNC` window), one `abort_reason='HW_FAULT'` (Ember's knee actuator, which opened the P2 work order).
- **1 `SCRUBBED`** — PII: bystander faces recorded outside consented area.
- **4 upcoming**: 1 `CONFIRMED` (tomorrow, Bramble + Grommet, `URB-004` multi-robot, spotter OP-006), 1 `READY`, 1 `ASSEMBLING`, 1 `DRAFT` that **fails preflight** (Cinder — calibration expires before the run ends) so the readiness UI has a live failing example.

Each historical run should carry: a `ReadinessSnapshot` at SCHEDULE and PREFLIGHT, 6–14 `RunEvent` rows, `MissionExecution` rows with a realistic ~85 % `usable` rate, and `TimeSyncCheck` rows (mostly `LOCKED` with `master_offset_ns` 20k–180k; the aborted one showing `HOLDOVER` then `FREE_RUN`).

### 10.8 Datasets

- `ds-urban-sidewalk` — v1 `PUBLISHED` (312 members, 41 h, splits 70/15/10/5), v2 `PUBLISHED` (adds low-light), v3 `BUILDING`.
- `ds-warehouse-nav` — v3 `REVOKED` (`revoked_reason='Extrinsic set RIG-WHS-B v2 rejected'`), v4 `BUILDING` after recalibration.
- `ds-grasp-force` — v1 `FROZEN`, awaiting `LabJob LJ-0007` (`CUBOID_3D` + `TRAJECTORY`, vendor `EXTERNAL_A`, 12,400 frames, `IN_REVIEW`, agreement 0.91).

### 10.9 Maintenance / parts / incidents

Service intervals: QDX-4 `KNEE_ACTUATOR_INSPECT` (500 motor h / 180 d, blocking), `FOOT_PAD_REPLACE` (200 km, consumable), `LIDAR_MOUNT_TORQUE` (90 d, blocking, invalidates calibration), `ESTOP_FUNCTION_TEST` (30 d, blocking, safety). AMR-T2 `DRIVE_BELT` (1500 km), `BATTERY_CAPACITY_TEST` (400 cycles). ARM-P6 `J3_HARMONIC_DRIVE` (1.5 M cycles), `FT_ZERO_CHECK` (30 d).

Seed states: 3 robots `OK`, 4 `WARN` (80–99 %), 2 `DUE`, 1 `OVERDUE` (Foxglove `BATTERY_CAPACITY_TEST`, blocking).

Parts: `PN-QK-KNEE-A2` knee actuator ($1,840, 21 d lead, stock FEN 1 / reorder 2 → **below reorder point**), `PN-QK-FOOT-STD` foot pad (stock 14), `PN-T2-BELT-9` drive belt (stock 6), `PN-CAM-GMSL-2M` camera module (stock 3), `PN-BAT-QK-21` battery pack (stock 2, on order 2).

Incidents: `INC-2026-014` MAJOR/COLLISION (Ironwood vs. shelf upright, quarantined, calibration invalidated, corrective actions open); `INC-2026-009` NEAR_MISS/PINCH at `MRW-C1`; `INC-2026-021` MINOR/THERMAL (Grommet drive motor over-temp during a 3-hour block → produced the `max_daily_mission_hours` policy).

Known issues: `KI-014` "nav-3.7.1 planner stall on low-texture aisles" (`STACK_VERSION`, MITIGATED, fixed in `nav-3.7.2`, detection signature: `fault_code=PLN_TIMEOUT` + `disengagements>3/run`); `KI-007` "LX-64R ring 12 dropout above 45 °C" (`SENSOR_MODEL`, OPEN, workaround: pre-cool + duty limit).

Alerts: 2 active — `battery_soh_pct < 75` on Foxglove (WARN), `calibration_valid_until within 7d` on Cinder (WARN); 1 `ACKED` low-stock alert on `PN-QK-KNEE-A2`.

### 10.10 Seed sanity checks

The seed is correct if, out of the box:
1. `GET /robots/{cinder}/readiness?run_id={draft run}` returns `FAIL` with gate `CALIBRATION_VALID_THROUGH_RUN_END`.
2. `GET /robots/{larkspur}/readiness` returns `FAIL` with `CALIBRATION_NEVER_PERFORMED` and `LIFECYCLE_NOT_ACTIVE`.
3. `POST /runs/{x}/confirm` with Ironwood returns 409 `ROBOT_QUARANTINED`.
4. Assigning OP-007 as run operator returns 422 `OPERATOR_NOT_CERTIFIED`.
5. `GET /dataset-versions/{ds-warehouse-nav v3}/lineage` traces back to the rejected extrinsic set.
6. `GET /schedule/conflicts` returns exactly one seeded conflict (an overlapping robot reservation on Grommet).
7. `GET /briefing/daily?lab_id=LAB-FEN` lists: 1 overdue blocking maintenance, 1 expiring calibration, 1 expiring certification, 1 part below reorder, 2 active alerts, 4 scheduled runs.
8. `GET /campaigns/CMP-URB-01/progress` shows usable reps < attempted reps for every mission.

---

## Appendix A — Implementation order (recommended)

1. **Schema + seed** (§8, §10) — everything else is validated against the seed sanity checks.
2. **Robot / Lab / Operator CRUD + fleet status page** — KV snapshot, no DO yet.
3. **Sensor / rig / calibration** — including the invalidation rules; this is the load-bearing differentiator.
4. **Readiness engine** (§5) as a pure, testable function `evaluateReadiness(ctx) → ReadinessSnapshot`, callable from both scheduling and preflight paths. Unit-test every gate against the seed.
5. **Campaign / mission catalog + run state machine** — state transitions as an explicit table with allowed-transition guards.
6. **Scheduling + conflicts** — greedy packer with hard-constraint filter; `BayScheduler` DO for booking atomicity.
7. **Telemetry ingest** — agent endpoints → Queue → AE + `RobotActor` DO + KV.
8. **DataOps** — presigned upload, MCAP indexing Workflow, topic coverage, QA, dataset build + promotion gates + lineage.
9. **Maintenance / parts / incidents + daily briefing.**

## Appendix B — Non-obvious pitfalls to design against

- **Do not store live telemetry in D1.** A 10-robot fleet at 5 Hz × 20 metrics is ~86 M rows/day. D1 is for state, not streams.
- **Do not compute readiness in the browser.** It must be one server-side function with recorded evidence, or the gates will drift between the scheduler, the preflight screen, and the API.
- **Snapshot, don't reference, at run time.** `RunRobot.extrinsic_set_id` and `Run.stack_version_snapshot` must be copies; following a live FK later gives the *current* calibration, not the one used.
- **Segment-level QA, not file-level.** Discarding whole 40-minute bags for a 90-second desync wastes most of your collection budget.
- **Usable ≠ attempted.** Every progress number in the UI should be usable-based, with attempted shown as a secondary figure.
- **Calendar-only maintenance under-serves heavy users and over-serves idle ones.** Duty-cycle intervals matter more as fleet utilization becomes uneven.
- **Time sync must be checked during the run, not only before it.** A PTP grandmaster can drop at minute three, and everything after that is silently unusable.
