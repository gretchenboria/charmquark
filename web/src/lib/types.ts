// Shared types mirroring the FastAPI backend schemas (app/schemas.py).

export type SessionState =
  | "DRAFT"
  | "ASSEMBLING"
  | "READY"
  | "CONFIRMED"
  | "IN_EXECUTION"
  | "COLLECTED"
  | "EXTRACTED"
  | "MANUAL_QA"
  | "VALIDATED"
  | "UPLOADED"
  | "DONE"
  | "BLOCKED"
  | "CANCELLED";

export type TaskScope = "GROUP" | "SINGLE";
export type RiskLevel = "LOW" | "POTENTIAL" | "HIGH" | "UNKNOWN";
export type LegalApproval = "NONE" | "PENDING" | "APPROVED";
export type StudyType = "PERCEPTION" | "MANIPULATION" | "NAVIGATION";
export type TaskDuration = "SHORT" | "MEDIUM" | "LONG" | "UNSPECIFIED";
export type TaskScheduleStatus = "AVAILABLE" | "IN_PROGRESS" | "RECORDED";

export interface Study {
  id: string;
  name: string;
  study_type: StudyType;
  target_n: number;
  status: string;
}

export interface TaskGroup {
  id: string;
  study_id: string;
  name: string;
  order: number;
}

export interface Task {
  id: string;
  study_id: string;
  task_group_id: string | null;
  task_code: string;
  name: string;
  risk_level: RiskLevel;
  legal_approval: LegalApproval;
  duration_type: TaskDuration;
  reps_target: number;
  reps_actual: number;
  reps_gap: number;
  schedule_status: TaskScheduleStatus;
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

export interface TaskDetail extends Task {
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

export interface TaskInstructions {
  task_id: string;
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
  session: Session;
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

export interface DeviceFleet {
  id: string;
  study_id: string;
  name: string;
  device_ids: string[];
}

export interface Device {
  id: string;
  asset_name: string;
  device_type: string;
  status: string;
}

export interface InventoryItem {
  id: string;
  study_id: string;
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

export interface Session {
  id: string;
  study_id: string;
  slot_date: string | null;
  slot_time: string | null;
  state: SessionState;
  task_scope: TaskScope;
  task_group_id: string | null;
  task_ids: string[];
  robot_id: string | null;
  operator_id: string | null;
  lab_id: string | null;
  device_fleet_id: string | null;
  provisional_code: string | null;
  encoded_code: string | null;
  payload: string | null;
  session_lab: string | null;
  task_reps: Record<string, number>;  // auto-schedule rep plan: task_id -> reps this session
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

export type SessionAssign = Partial<{
  task_scope: TaskScope;
  task_group_id: string | null;
  task_ids: string[];
  robot_id: string | null;
  operator_id: string | null;
  lab_id: string | null;
  device_fleet_id: string | null;
  slot_date: string | null;
}>;

export interface QACheckItem {
  name: string;
  result: string;
}
export interface QAGate {
  level: string;
  name: string;
  status: string;
  check_items: QACheckItem[];
}
export interface QARun {
  id: string;
  session_id: string;
  overall_status: string;
  gates: QAGate[];
}

export interface User {
  id: string;
  subject: string;
  name: string;
  email: string | null;
  role: "PM" | "FLEET_LEAD" | "ROBOT_OPERATOR";
  is_active: boolean;
}

// ---- BPMN workflow diagrams (Docs/workflows/*.bpmn) ----
export interface WorkflowSummary {
  id: string;
  name: string;
}
export interface WorkflowContent extends WorkflowSummary {
  xml: string;
}

// ---- auto-scheduling (automated session scheduling) — mirrors app/schemas.py ----
export interface ProposalTask {
  id: string;
  task_code: string;
  name: string;
  group: string | null;
  duration_type: TaskDuration;
  effort_units: number;
  reps_gap: number;
  reps: number;        // reps of this task/variant/error scheduled in this session
  row_units: number;   // effort_units * reps
}

export interface SessionProposal {
  session_id: string;
  tasks: ProposalTask[];
  total_units: number;
  total_reps: number;     // total recordings across all tasks (== session CSV rows)
  budget: number;
  meets_floor: boolean;   // >= 2 effort units (a valid session)
  fully_packed: boolean;  // total_units == budget
}

export interface AcceptProposalResult {
  session: Session;
  task_count: number;
  session_csv: string;
  saved_path: string | null;
}

export interface AutoFillResult {
  created: number;
  slots_used: number;
  reps_remaining: number;
  session_ids: string[];
}

export interface TaskStatusChange {
  task_id: string;
  schedule_status: TaskScheduleStatus;
  reps_actual: number;
  reps_gap: number;
}

export interface UploadResult {
  recorded: string[];   // tasks completed this session
  reverted: string[];   // tasks the user dropped -> back to AVAILABLE
  tasks: TaskStatusChange[];
}

// ---- Catalog Sync (CSV round-trip) — mirrors app/schemas.py ----
export interface CatalogFieldChange {
  from: string;
  to: string;
}

export interface CatalogCreate {
  task_code: string;   // the code as given, or "(auto)" for a blank-code new row
  name: string;
  group: string;
}

export interface CatalogUpdate {
  task_code: string;
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
