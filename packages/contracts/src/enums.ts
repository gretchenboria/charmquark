/**
 * Every enumerated value in CharmQuark, defined once.
 *
 * The API validates against these, the web app renders its dropdowns from them,
 * and `api/test/contracts.test.ts` fails if any list drifts from the SQL CHECK
 * constraint it mirrors. Adding a value means: a new migration that widens the
 * CHECK, then the value here — the test tells you if you only did one.
 *
 * Dependency-free on purpose, so the Worker, the web bundle and node's test
 * runner can all import it directly.
 */

export const ROLES = ["PM", "FLEET_LEAD", "ROBOT_OPERATOR"] as const;

export const CAMPAIGN_TYPES = ["PERCEPTION", "MANIPULATION", "NAVIGATION"] as const;
export const CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;

export const MISSION_STATUSES = ["NEW", "SELECTED", "IN_PREP", "COLLECTABLE"] as const;
export const MISSION_REVIEW_STATUSES = ["DRAFT", "PENDING_PM_REVIEW", "APPROVED", "UNAVAILABLE"] as const;
export const MISSION_DURATIONS = ["SHORT", "MEDIUM", "LONG", "UNSPECIFIED"] as const;
export const MISSION_SCHEDULE_STATUSES = ["AVAILABLE", "IN_PROGRESS", "RECORDED"] as const;
export const RISK_LEVELS = ["LOW", "POTENTIAL", "HIGH", "UNKNOWN"] as const;
export const LEGAL_APPROVALS = ["NONE", "PENDING", "APPROVED"] as const;

export const INVENTORY_KINDS = ["CONSUMABLE", "TOOL", "PAYLOAD", "SPARE_PART"] as const;
export const INVENTORY_STATUSES = ["NEEDED", "ORDERED", "AVAILABLE", "DEPLETED"] as const;

export const ROBOT_STATUSES = ["POOL", "ACTIVE", "MAINTENANCE", "RETIRED"] as const;
export const OPERATOR_ROLES = ["ROBOT_OPERATOR", "QA_REVIEWER", "FIELD_LEAD", "DATA_ENGINEER"] as const;
export const LAB_TYPES = ["LAB_BAY", "OFFICE", "OUTDOORS"] as const;

export const SENSOR_STATUSES = ["OPERATIONAL", "DEGRADED", "DOWN", "MAINTENANCE", "RETIRED"] as const;
/**
 * Suggested sensor modalities. `sensors.sensor_type` has no CHECK — a customer's
 * rig may carry something not listed — so this is offered, not enforced.
 */
export const SENSOR_TYPES = [
  "LIDAR_3D", "STEREO_CAMERA", "DEPTH_CAMERA", "IMU", "GNSS_RTK",
  "THERMAL", "FORCE_TORQUE", "AUDIO_ARRAY", "ENCODER",
] as const;

export const RUN_STATES = [
  "DRAFT", "ASSEMBLING", "READY", "CONFIRMED", "IN_EXECUTION",
  "COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED",
  "DONE", "BLOCKED", "CANCELLED",
] as const;
/** The part of RUN_STATES that `POST /runs/:id/advance` walks, in order. */
export const RUN_PIPELINE = [
  "CONFIRMED", "IN_EXECUTION", "COLLECTED", "EXTRACTED",
  "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE",
] as const;
export const MISSION_SCOPES = ["GROUP", "SINGLE"] as const;

export const QA_LEVELS = ["FIELD", "LAB", "FINAL"] as const;
export const QA_OVERALL_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "PASS", "FAIL", "WAIVED"] as const;
export const QA_MODES = ["MANUAL", "AUTOCHECK"] as const;
export const QA_VERDICTS = ["ACCEPT", "ACCEPT_WITH_WARNINGS", "REJECT"] as const;

export const DOCUMENT_CATEGORIES = ["RECORDING", "INSTRUCTION", "REPORT", "LEGAL", "OTHER"] as const;
export const DOCUMENT_STATUSES = ["DRAFT", "FINAL", "ARCHIVED"] as const;

export const ROBOFLOW_SPLITS = ["train", "valid", "test"] as const;
export const ROBOFLOW_EXPORT_STATUSES = ["PENDING", "COMPLETE", "PARTIAL", "FAILED"] as const;

export const LEDGER_REASONS = ["PURCHASE", "GRANT", "DEBIT", "REFUND", "ADJUSTMENT"] as const;
export const CHECKOUT_STATUSES = ["PENDING", "COMPLETED"] as const;

export type Role = (typeof ROLES)[number];
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export type MissionStatus = (typeof MISSION_STATUSES)[number];
export type MissionReviewStatus = (typeof MISSION_REVIEW_STATUSES)[number];
export type MissionDuration = (typeof MISSION_DURATIONS)[number];
export type MissionScheduleStatus = (typeof MISSION_SCHEDULE_STATUSES)[number];
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type LegalApproval = (typeof LEGAL_APPROVALS)[number];
export type InventoryKind = (typeof INVENTORY_KINDS)[number];
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];
export type RobotStatus = (typeof ROBOT_STATUSES)[number];
export type OperatorRole = (typeof OPERATOR_ROLES)[number];
export type LabType = (typeof LAB_TYPES)[number];
export type SensorStatus = (typeof SENSOR_STATUSES)[number];
export type RunState = (typeof RUN_STATES)[number];
export type MissionScope = (typeof MISSION_SCOPES)[number];
export type QaVerdict = (typeof QA_VERDICTS)[number];
export type LedgerReason = (typeof LEDGER_REASONS)[number];

/**
 * `table.column` -> the list its CHECK constraint must equal. The contract test
 * also fails on any CHECK ... IN (...) in the migrations that is missing here,
 * so a new enum column cannot be added without a contract.
 */
export const DB_ENUMS: Record<string, readonly string[]> = {
  "users.role": ROLES,
  "campaigns.campaign_type": CAMPAIGN_TYPES,
  "campaigns.status": CAMPAIGN_STATUSES,
  "missions.status": MISSION_STATUSES,
  "missions.review_status": MISSION_REVIEW_STATUSES,
  "missions.duration_type": MISSION_DURATIONS,
  "missions.schedule_status": MISSION_SCHEDULE_STATUSES,
  "missions.risk_level": RISK_LEVELS,
  "missions.legal_approval": LEGAL_APPROVALS,
  "inventory_items.kind": INVENTORY_KINDS,
  "inventory_items.status": INVENTORY_STATUSES,
  "robots.status": ROBOT_STATUSES,
  "operators.role": OPERATOR_ROLES,
  "labs.type": LAB_TYPES,
  "sensors.status": SENSOR_STATUSES,
  "runs.state": RUN_STATES,
  "runs.mission_scope": MISSION_SCOPES,
  "qa_pipeline_runs.level": QA_LEVELS,
  "qa_pipeline_runs.overall_status": QA_OVERALL_STATUSES,
  "documents.vault_category": DOCUMENT_CATEGORIES,
  "documents.status": DOCUMENT_STATUSES,
  "roboflow_exports.split": ROBOFLOW_SPLITS,
  "roboflow_exports.status": ROBOFLOW_EXPORT_STATUSES,
  "credit_ledger.reason": LEDGER_REASONS,
  "billing_checkout_sessions.status": CHECKOUT_STATUSES,
};

// ---------------------------------------------------------------- labels
/** Where title-casing the code reads wrong. Everything else is derived. */
const LABEL_OVERRIDES: Record<string, string> = {
  PM: "PM",
  QA_REVIEWER: "QA Reviewer",
  PENDING_PM_REVIEW: "Pending PM review",
  LIDAR_3D: "3D LiDAR",
  IMU: "IMU",
  GNSS_RTK: "GNSS RTK",
  FORCE_TORQUE: "Force/torque",
  MANUAL_QA: "Manual QA",
  ACCEPT_WITH_WARNINGS: "Accept with warnings",
};

/** "LAB_BAY" -> "Lab bay", "FLEET_LEAD" -> "Fleet lead". */
export function labelFor(value: string): string {
  const override = LABEL_OVERRIDES[value];
  if (override) return override;
  const words = value.toLowerCase().split("_");
  return [words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1), ...words.slice(1)].join(" ");
}

/** Dropdown options for a value list. */
export const optionsFor = (values: readonly string[]): { value: string; label: string }[] =>
  values.map((value) => ({ value, label: labelFor(value) }));
