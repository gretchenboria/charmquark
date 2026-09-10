/** Row -> API DTO mappers. These define the wire contract the frontend consumes. */
import { num, numOrNull, parseJson, str, strOrNull, toBool, type Row } from "./db";
import {
  isSchedulable,
  isTaskReady,
  repsGap,
  taskChecklist,
  variantOptions,
  type RiskLevel,
  type TaskDuration,
  type TaskLike,
} from "./domain";

export const study = (r: Row) => ({
  id: str(r, "id"),
  name: str(r, "name"),
  study_type: str(r, "study_type"),
  target_n: num(r, "target_n"),
  status: str(r, "status"),
  default_device_fleet_id: strOrNull(r, "default_device_fleet_id"),
});

export const taskGroup = (r: Row) => ({
  id: str(r, "id"),
  study_id: str(r, "study_id"),
  name: str(r, "name"),
  order: num(r, "order"),
});

/** The structural shape the pure readiness engine needs, built from a DB row. */
export function taskLike(r: Row): TaskLike & {
  reps_target: number;
  reps_actual: number;
  schedule_status: string;
} {
  return {
    id: str(r, "id"),
    task_code: str(r, "task_code"),
    name: str(r, "name"),
    instructions_complete: toBool(r["instructions_complete"]),
    risk_level: str(r, "risk_level") as RiskLevel,
    legal_approval: str(r, "legal_approval") as "NONE" | "PENDING" | "APPROVED",
    review_status: str(r, "review_status") as TaskLike["review_status"],
    duration_type: str(r, "duration_type") as TaskDuration,
    variants: parseJson<unknown[]>(r["variants"], []),
    reps_target: num(r, "reps_target"),
    reps_actual: num(r, "reps_actual"),
    schedule_status: str(r, "schedule_status"),
  };
}

export function task(r: Row) {
  const t = taskLike(r);
  return {
    id: t.id,
    study_id: str(r, "study_id"),
    task_group_id: strOrNull(r, "task_group_id"),
    task_code: t.task_code,
    name: t.name,
    group: strOrNull(r, "group"),
    status: str(r, "status"),
    review_status: t.review_status,
    risk_level: t.risk_level,
    legal_approval: t.legal_approval,
    duration_type: t.duration_type,
    reps_target: t.reps_target,
    reps_actual: t.reps_actual,
    reps_gap: repsGap(t),
    schedule_status: t.schedule_status,
    instructions_complete: t.instructions_complete,
    is_ready: isTaskReady(t),
    is_schedulable: isSchedulable(t),
    inventory_item_ids: parseJson<string[]>(r["inventory_item_ids"], []),
  };
}

/** Task + the embedded value objects and checklist the detail page renders. */
export function taskDetail(r: Row) {
  const t = taskLike(r);
  return {
    ...task(r),
    variants: t.variants,
    variant_options: variantOptions(t.task_code, t.variants),
    instructions: parseJson<unknown[]>(r["instructions"], []),
    checklist: taskChecklist(t, null),
  };
}

export const robot = (r: Row) => {
  const safety = toBool(r["safety_certified"]);
  const calib = toBool(r["calibration_valid"]);
  const comm = toBool(r["commissioned"]);
  return {
    id: str(r, "id"),
    robot_code: str(r, "robot_code"),
    name: strOrNull(r, "name"),
    platform: strOrNull(r, "platform"),
    serial_number: strOrNull(r, "serial_number"),
    status: str(r, "status"),
    safety_certified: safety,
    calibration_valid: calib,
    commissioned: comm,
    commissioned_date: strOrNull(r, "commissioned_date"),
    /** Assignable when safety, calibration and commissioning all hold. */
    is_cleared: safety && calib && comm,
    is_standby: toBool(r["is_standby"]),
  };
};

export const operator = (r: Row) => ({
  id: str(r, "id"),
  operator_code: str(r, "operator_code"),
  name: str(r, "name"),
  role: str(r, "role"),
  is_active: toBool(r["is_active"]),
  code_number: numOrNull(r, "code_number"),
});

export const lab = (r: Row) => ({
  id: str(r, "id"),
  name: str(r, "name"),
  type: str(r, "type"),
  is_available: toBool(r["is_available"]),
  capacity: num(r, "capacity"),
  code_number: numOrNull(r, "code_number"),
});

export const device = (r: Row) => ({
  id: str(r, "id"),
  asset_name: str(r, "asset_name"),
  device_type: str(r, "device_type"),
  status: str(r, "status"),
  current_study_id: strOrNull(r, "current_study_id"),
});

export const deviceFleet = (r: Row) => ({
  id: str(r, "id"),
  study_id: str(r, "study_id"),
  name: str(r, "name"),
  device_ids: parseJson<string[]>(r["device_ids"], []),
});

export const inventoryItem = (r: Row) => ({
  id: str(r, "id"),
  study_id: str(r, "study_id"),
  name: str(r, "name"),
  kind: str(r, "kind"),
  quantity: num(r, "quantity", 1),
  unit: str(r, "unit"),
  status: str(r, "status"),
  is_available: str(r, "status") === "AVAILABLE",
});

export const session = (r: Row) => ({
  id: str(r, "id"),
  study_id: str(r, "study_id"),
  slot_date: strOrNull(r, "slot_date"),
  slot_time: strOrNull(r, "slot_time"),
  state: str(r, "state"),
  task_scope: str(r, "task_scope"),
  task_group_id: strOrNull(r, "task_group_id"),
  task_ids: parseJson<string[]>(r["task_ids"], []),
  task_reps: parseJson<Record<string, number>>(r["task_reps"], {}),
  completed_task_ids: parseJson<string[]>(r["completed_task_ids"], []),
  collected_rows: parseJson<Record<string, string>[]>(r["collected_rows"], []),
  execution_log: parseJson<Record<string, unknown>>(r["execution_log"], {}),
  robot_id: strOrNull(r, "robot_id"),
  operator_id: strOrNull(r, "operator_id"),
  lab_id: strOrNull(r, "lab_id"),
  device_fleet_id: strOrNull(r, "device_fleet_id"),
  provisional_code: strOrNull(r, "provisional_code"),
  encoded_code: strOrNull(r, "encoded_code"),
  session_seq: numOrNull(r, "session_seq"),
  payload: strOrNull(r, "payload"),
  session_lab: strOrNull(r, "session_lab"),
  notes: strOrNull(r, "notes"),
});

export const qaRun = (r: Row) => ({
  id: str(r, "id"),
  session_id: str(r, "session_id"),
  level: str(r, "level"),
  overall_status: str(r, "overall_status"),
  gates: parseJson<unknown[]>(r["gates"], []),
});

export const doc = (r: Row) => ({
  id: str(r, "id"),
  filename: str(r, "filename"),
  mime_type: str(r, "mime_type"),
  file_path: str(r, "file_path"),
  vault_category: str(r, "vault_category"),
  status: str(r, "status"),
  linked_entity_type: strOrNull(r, "linked_entity_type"),
  linked_entity_id: strOrNull(r, "linked_entity_id"),
  doc_metadata: parseJson<unknown[]>(r["doc_metadata"], []),
});

export const user = (r: Row) => ({
  id: str(r, "id"),
  subject: str(r, "subject"),
  name: str(r, "name"),
  email: strOrNull(r, "email"),
  role: str(r, "role"),
  is_active: toBool(r["is_active"]),
});

export const workflow = (r: Row) => ({
  id: str(r, "id"),
  name: str(r, "name"),
  xml: str(r, "xml"),
});
