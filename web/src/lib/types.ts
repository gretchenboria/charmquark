// Wire types for the API (api/src/serialize.ts). Enumerated values come from the
// shared contracts, so a dropdown or type here cannot drift from the database.
import type {
  CampaignType,
  LegalApproval,
  MissionDuration,
  MissionScheduleStatus,
  MissionScope,
  RiskLevel,
  RunState,
} from "@contracts";

export type { CampaignType, LegalApproval, MissionDuration, MissionScheduleStatus, MissionScope, RiskLevel, RunState };

export interface Campaign {
  id: string;
  name: string;
  campaign_type: CampaignType;
  target_n: number;
  status: string;
}

export interface MissionGroup {
  id: string;
  campaign_id: string;
  name: string;
  order: number;
}

export interface Mission {
  id: string;
  campaign_id: string;
  mission_group_id: string | null;
  mission_code: string;
  name: string;
  risk_level: RiskLevel;
  legal_approval: LegalApproval;
  duration_type: MissionDuration;
  reps_target: number;
  reps_actual: number;
  reps_gap: number;
  schedule_status: MissionScheduleStatus;
  instructions_complete: boolean;
  is_ready: boolean;
  is_schedulable: boolean;
  inventory_item_ids: string[];
}

export interface ExecutionSpecLite {
  id: string;
  label?: string;
  errorClass?: string | null;
  reps?: number; // optional per-combination repetition target
}

export interface VariantLite {
  id: string;
  name?: string;
  correct?: ExecutionSpecLite;
  errors?: ExecutionSpecLite[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  source: "auto" | "manual";
}

export interface VariantErrorOption {
  error_number: number;
  label: string;
  code: string; // T#V#E# execution code
  reps?: number | null; // optional per-combination repetition target
}

export interface VariantOption {
  variant_number: number;
  name: string;
  errors: VariantErrorOption[];
}

export interface MissionDetail extends Mission {
  variants: VariantLite[];
  variant_options?: VariantOption[]; // numbered V/E picker options with T#V#E# codes
  instructions?: unknown[];
  checklist?: ChecklistItem[];
}

export type InstructionFormat = "txt" | "json";

export interface InstructionVersion {
  version_id: string;
  version_number: number;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface MissionInstructions {
  mission_id: string;
  format: InstructionFormat;
  current_version: number | null;
  content: string;
  versions: InstructionVersion[];
}

export interface CloudStatus {
  database: "postgresql" | "sqlite";
  provider: string;
  reachable: boolean;
  detail: string;
}

export interface Robot {
  id: string;
  robot_code: string;
  status: string;
  safety_certified: boolean;
  calibration_valid: boolean;
  commissioned: boolean;
  is_cleared: boolean;
  is_standby: boolean;
  checklist?: ChecklistItem[];
}

export interface RobotSwap {
  run: Run;
  swapped_in: string | null;
  previous: string | null;
  message: string;
}

export interface Operator {
  id: string;
  operator_code: string;
  role: string;
  is_active: boolean;
  code_number: number | null;
}

export interface Lab {
  id: string;
  name: string;
  type: string;
  is_available: boolean;
  capacity: number;
  code_number: number | null;
}

export interface SensorRig {
  id: string;
  campaign_id: string;
  name: string;
  sensor_ids: string[];
}

export interface Sensor {
  id: string;
  asset_name: string;
  sensor_type: string;
  status: string;
}

export interface InventoryItem {
  id: string;
  campaign_id: string;
  name: string;
  kind: string;
  status: string;
  is_available: boolean;
}

export type CollectedRow = Record<string, string>;

export interface ExecutionLogEntry {
  done?: boolean;
  note?: string;
  variant_code?: string | null;
  updated_at?: string | null;
}

export type ExecutionLog = Record<string, ExecutionLogEntry>;

export interface Run {
  id: string;
  campaign_id: string;
  slot_date: string | null;
  slot_time: string | null;
  state: RunState;
  mission_scope: MissionScope;
  mission_group_id: string | null;
  mission_ids: string[];
  robot_id: string | null;
  operator_id: string | null;
  lab_id: string | null;
  sensor_rig_id: string | null;
  provisional_code: string | null;
  encoded_code: string | null;
  payload: string | null;
  run_lab: string | null;
  mission_reps: Record<string, number>;  // auto-schedule rep plan: mission_id -> reps this run
  collected_rows: CollectedRow[];
  execution_log: ExecutionLog;
}

export interface ReadinessIssue {
  member: string;
  reason: string;
}

export interface Readiness {
  ready: boolean;
  can_confirm: boolean;
  issues: ReadinessIssue[];
}

// ---- Vault (documents / recordings) — mirrors app/schemas.py CharmQuarkDocumentOut ----
export interface CharmQuarkDocument {
  id: string;
  filename: string;
  mime_type: string;
  file_path: string;            // object-storage key
  vault_category: string;
  status: string;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  doc_metadata: { size_bytes?: number; storage?: string }[];
}

export type RunAssign = Partial<{
  mission_scope: MissionScope;
  mission_group_id: string | null;
  mission_ids: string[];
  robot_id: string | null;
  operator_id: string | null;
  lab_id: string | null;
  sensor_rig_id: string | null;
  slot_date: string | null;
}>;

export interface QACheckItem {
  name: string;
  result: string;
  /**
   * Present only on autochecked runs. What the machine concluded, kept alongside
   * `result` so a human override is visible as an override rather than erasing
   * the original finding.
   */
  machine_result?: string;
  level?: "pass" | "warn" | "fail" | "info";
  /** The sensor / file the finding is about, e.g. "lidar_top/segment 2". */
  subject?: string | null;
  detail?: string;
}
export interface QAGate {
  level: string;
  name: string;
  /** Protocol step 1–6 on an autochecked run; absent on the manual checklist. */
  step?: number;
  status: string;
  check_items: QACheckItem[];
}
export type QAVerdict = "ACCEPT" | "ACCEPT_WITH_WARNINGS" | "REJECT";
export interface QARun {
  id: string;
  run_id: string;
  overall_status: string;
  gates: QAGate[];
  mode: "MANUAL" | "AUTOCHECK";
  verdict: QAVerdict | null;
  profile_name: string | null;
  autochecked_at: string | null;
}

// ---- Roboflow annotation handoff ----
export interface RoboflowExport {
  id: string;
  run_id: string;
  workspace: string | null;
  project: string;
  batch: string | null;
  split: string;
  status: "PENDING" | "COMPLETE" | "PARTIAL" | "FAILED";
  image_count: number;
  duplicate_count: number;
  failed_count: number;
  dataset_version: string | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
}
export interface RoboflowStatus {
  annotation_configured: boolean;
  workspace: string | null;
  max_images_per_export: number;
  exports: RoboflowExport[];
}

export interface User {
  id: string;
  subject: string;
  name: string;
  email: string | null;
  role: "PM" | "FLEET_LEAD" | "ROBOT_OPERATOR";
  is_active: boolean;
}

// ---- BPMN workflow diagrams (validation report and graph types come from @contracts) ----
export interface WorkflowSummary {
  id: string;
  name: string;
}
export interface WorkflowContent extends WorkflowSummary {
  xml: string;
  version: number;
}
export interface WorkflowVersionSummary {
  id: string;
  version: number;
  name: string;
  saved_by: string | null;
  created_at: string;
  xml_chars: number;
}
// ---- configuration bundle (POST /config/plan and /config/apply) ----
export interface ConfigRecordPreview {
  index: number;
  resource: string;
  op: "create" | "update" | "delete";
  id: string | null;
  ref: string | null;
  ok: boolean;
  problems: string[];
  diff: Record<string, { from: unknown; to: unknown }>;
}
export interface ConfigPlanSummary {
  create: number;
  update: number;
  delete: number;
  settings: number;
  workflows: number;
}
export interface ConfigPlanReport {
  ok: boolean;
  digest: string;
  problem_count: number;
  summary: ConfigPlanSummary;
  problems: string[];
  records: ConfigRecordPreview[];
  settings: { key: string; from: unknown; to: unknown }[];
  workflows: { op: "create" | "update" | "delete"; id: string | null; name: string; xml_changed: boolean; name_changed: boolean }[];
}
export interface ConfigApplyResult {
  status: "APPLIED" | "PARTIAL";
  digest: string;
  summary: ConfigPlanSummary;
  changeset_id: string | null;
  created: Record<string, string>;
  workflows: { op: string; id: string | null; name: string; status: number; detail?: unknown }[];
}

export interface WorkflowVersion {
  workflow_id: string;
  version: number;
  name: string;
  xml: string;
  saved_by: string | null;
  created_at: string;
}

// ---- auto-scheduling (automated run scheduling) — mirrors app/schemas.py ----
export interface ProposalMission {
  id: string;
  mission_code: string;
  name: string;
  group: string | null;
  duration_type: MissionDuration;
  effort_units: number;
  reps_gap: number;
  reps: number;        // reps of this mission/variant/error scheduled in this run
  row_units: number;   // effort_units * reps
}

export interface RunProposal {
  run_id: string;
  missions: ProposalMission[];
  total_units: number;
  total_reps: number;     // total recordings across all missions (== run CSV rows)
  budget: number;
  meets_floor: boolean;   // >= 2 effort units (a valid run)
  fully_packed: boolean;  // total_units == budget
}

export interface AcceptProposalResult {
  run: Run;
  task_count: number;
  run_csv: string;
  saved_path: string | null;
}

export interface AutoFillResult {
  created: number;
  slots_used: number;
  reps_remaining: number;
  run_ids: string[];
}

export interface MissionStatusChange {
  mission_id: string;
  schedule_status: MissionScheduleStatus;
  reps_actual: number;
  reps_gap: number;
}

export interface UploadResult {
  recorded: string[];   // missions completed this run
  reverted: string[];   // missions the user dropped -> back to AVAILABLE
  missions: MissionStatusChange[];
}

// ---- Catalog Sync (CSV round-trip) — mirrors app/schemas.py ----
export interface CatalogFieldChange {
  from: string;
  to: string;
}

export interface CatalogCreate {
  mission_code: string;   // the code as given, or "(auto)" for a blank-code new row
  name: string;
  group: string;
}

export interface CatalogUpdate {
  mission_code: string;
  changes: Record<string, CatalogFieldChange>;
}

export interface CatalogDiff {
  creates: CatalogCreate[];
  updates: CatalogUpdate[];
  unchanged: number;
  errors: string[];
}

export interface CatalogApplyResult {
  created: number;
  updated: number;
  unchanged: number;
}

// ---- Billing: metered run credits (one credit = one confirmed run) ----
export interface CreditPack {
  id: string;
  name: string;
  description: string;
  credits: number;
  amount_cents: number;
  currency: string;
  cents_per_credit: number;
  tag: string | null;
}

export interface BillingAccount {
  account_id: string;
  name: string;
  balance: number;
  unlimited: boolean;
  lifetime_granted: number;
  lifetime_spent: number;
  credit_cost_per_run: number;
  /** False when the Worker has no Stripe secret — the modal says so rather than failing at checkout. */
  payments_configured: boolean;
  store_url?: string | null;
  packs: CreditPack[];
}

export type LedgerReason = "PURCHASE" | "GRANT" | "DEBIT" | "REFUND" | "ADJUSTMENT";

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: LedgerReason;
  balance_after: number;
  run_id: string | null;
  checkout_session_id: string | null;
  actor: string | null;
  note: string | null;
  created_at: string;
}

/** PENDING while the Stripe webhook is still in flight; the browser retries. */
export interface CheckoutClaim {
  status: "PENDING" | "COMPLETED" | "UNKNOWN";
  pack_id?: string;
  credits: number;
  balance: number;
  unlimited?: boolean;
}

export interface CheckoutStart {
  success: boolean;
  url: string;
  session_id: string;
}

// ---- Coverage space ------------------------------------------------------
// What a campaign needs, expressed as a state space rather than a rep count.

export interface CoverageDimension {
  key: string;
  label: string;
  levels: string[];
}

export interface CoverageSpace {
  dimensions: CoverageDimension[];
  target_per_cell: number;
}

export type CoverageCell = Record<string, string>;

export interface CellState {
  key: string;
  cell: CoverageCell;
  observed: number;
  target: number;
  gap: number;
  /** observed/target capped at 1 — for colour, not arithmetic. */
  fill: number;
}

export interface DimensionMarginal {
  key: string;
  label: string;
  levels: { level: string; observed: number; target: number; gap: number }[];
}

export interface CoverageState {
  target_per_cell: number;
  total_cells: number;
  touched_cells: number;
  complete_cells: number;
  total_observed: number;
  total_target: number;
  /** Fraction of CELLS complete — cannot be gamed by over-collecting one cell. */
  coverage: number;
  cells: CellState[];
  marginals: DimensionMarginal[];
}

export interface CellRecommendation {
  key: string;
  cell: CoverageCell;
  gap: number;
  priority: number;
  reason: string;
}

export interface CoverageReport {
  configured: boolean;
  space: CoverageSpace | null;
  state: CoverageState | null;
  next: CellRecommendation[];
}
