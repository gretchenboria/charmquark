/**
 * The resource registry: every editable record type, its fields, and who may do
 * what with it.
 *
 * This is the single answer to "can I change this, and if not, why?" for the
 * API (validation, writable columns, the role policy), the web app (dropdowns,
 * locked fields) and agents (it is what an MCP `describe_schema` tool returns).
 * `api/test/contracts.test.ts` pins it, so a change here is a deliberate one.
 *
 * Every record carries `version`. Send it back as `If-Match` on an update and a
 * write that would overwrite someone else's newer change is refused with 409.
 */
import {
  CAMPAIGN_STATUSES, CAMPAIGN_TYPES, DOCUMENT_CATEGORIES, DOCUMENT_STATUSES, INVENTORY_KINDS,
  INVENTORY_STATUSES, LAB_TYPES, LEGAL_APPROVALS, MISSION_DURATIONS, MISSION_REVIEW_STATUSES,
  MISSION_SCHEDULE_STATUSES, MISSION_SCOPES, MISSION_STATUSES, OPERATOR_ROLES, RISK_LEVELS,
  ROBOT_STATUSES, ROLES, RUN_STATES, SENSOR_STATUSES, SENSOR_TYPES, type Role,
} from "./enums.ts";
import type { FieldSpec } from "./fields.ts";

export interface ResourceSpec {
  /** Registry key and URL segment under /api, e.g. "sensor-rigs". */
  path: string;
  /** D1 table. */
  table: string;
  /** Singular, human, for messages: "sensor rig". */
  label: string;
  roles: { read: readonly Role[]; write: readonly Role[]; delete: readonly Role[] };
  fields: Record<string, FieldSpec>;
}

const ALL: readonly Role[] = ROLES;
const PLANNERS: readonly Role[] = ["PM", "FLEET_LEAD"];
const LEAD: readonly Role[] = ["FLEET_LEAD"];

const SERVER_ID: FieldSpec = { type: "id", label: "ID", readonly: "assigned by the server" };
const VERSION: FieldSpec = {
  type: "integer", label: "Version",
  readonly: "incremented on every change — send it back as If-Match so you never overwrite a newer edit",
};
const parent = (label: string): FieldSpec => ({
  type: "id", label, required: true, createOnly: true,
  readonly: "fixed after create — create a new record under the other parent instead",
});
const derived = (type: FieldSpec["type"], label: string, from: string): FieldSpec =>
  ({ type, label, readonly: `derived from ${from}` });

export const RESOURCES = {
  campaigns: {
    path: "campaigns", table: "campaigns", label: "campaign",
    roles: { read: ALL, write: PLANNERS, delete: LEAD },
    fields: {
      id: SERVER_ID,
      name: { type: "string", label: "Name", required: true },
      campaign_type: { type: "enum", label: "Type", values: CAMPAIGN_TYPES, required: true },
      target_n: { type: "integer", label: "Target N", min: 0 },
      status: { type: "enum", label: "Status", values: CAMPAIGN_STATUSES },
      default_sensor_rig_id: { type: "id", label: "Default sensor rig", nullable: true },
      coverage_space: { type: "json", label: "Coverage space", readonly: "set on the Coverage page (PUT /campaigns/:id/coverage-space)" },
      qa_profile: { type: "json", label: "QA profile", readonly: "not yet editable through the API" },
      version: VERSION,
    },
  },

  "mission-groups": {
    path: "mission-groups", table: "mission_groups", label: "mission group",
    roles: { read: ALL, write: PLANNERS, delete: PLANNERS },
    fields: {
      id: SERVER_ID,
      campaign_id: parent("Campaign"),
      name: { type: "string", label: "Name", required: true },
      order: { type: "integer", label: "Order", min: 0 },
      version: VERSION,
    },
  },

  missions: {
    path: "missions", table: "missions", label: "mission",
    roles: { read: ALL, write: PLANNERS, delete: PLANNERS },
    fields: {
      id: SERVER_ID,
      campaign_id: parent("Campaign"),
      mission_group_id: { type: "id", label: "Mission group", nullable: true },
      mission_code: { type: "string", label: "Code", required: true },
      name: { type: "string", label: "Name", required: true },
      group: { type: "string", label: "Group label", nullable: true },
      status: { type: "enum", label: "Status", values: MISSION_STATUSES },
      review_status: { type: "enum", label: "Review", values: MISSION_REVIEW_STATUSES },
      duration_type: { type: "enum", label: "Size", values: MISSION_DURATIONS },
      reps_target: { type: "integer", label: "Reps target", min: 0 },
      reps_actual: { type: "integer", label: "Reps recorded", min: 0 },
      schedule_status: { type: "enum", label: "Schedule status", values: MISSION_SCHEDULE_STATUSES },
      instructions_complete: { type: "boolean", label: "Instructions complete" },
      risk_level: {
        type: "enum", label: "Risk", values: RISK_LEVELS, default: "UNKNOWN", writeRoles: LEAD,
        writeRolesReason: "risk clearance decides schedulability — use Assess risk, or a Fleet Lead sets it",
      },
      legal_approval: {
        type: "enum", label: "Legal", values: LEGAL_APPROVALS, default: "NONE", writeRoles: LEAD,
        writeRolesReason: "the Fleet Lead legal review sets this",
      },
      variants: { type: "json", label: "Variants" },
      inventory_item_ids: { type: "id[]", label: "Required inventory" },
      instructions: { type: "json", label: "Instructions" },
      reps_gap: derived("integer", "Reps remaining", "reps target minus reps recorded"),
      is_ready: derived("boolean", "Ready", "instructions, risk clearance and variants"),
      is_schedulable: derived("boolean", "Schedulable", "readiness, reps remaining and schedule status"),
      version: VERSION,
    },
  },

  robots: {
    path: "robots", table: "robots", label: "robot",
    roles: { read: ALL, write: PLANNERS, delete: LEAD },
    fields: {
      id: SERVER_ID,
      robot_code: { type: "string", label: "Code", required: true },
      name: { type: "string", label: "Name", nullable: true },
      platform: { type: "string", label: "Platform", nullable: true },
      serial_number: { type: "string", label: "Serial number", nullable: true },
      status: { type: "enum", label: "Status", values: ROBOT_STATUSES },
      safety_certified: { type: "boolean", label: "Safety certified" },
      calibration_valid: { type: "boolean", label: "Calibration valid" },
      commissioned: { type: "boolean", label: "Commissioned" },
      commissioned_date: { type: "date", label: "Commissioned on", nullable: true },
      is_standby: { type: "boolean", label: "Standby" },
      is_cleared: derived("boolean", "Cleared", "safety, calibration and commissioning"),
      version: VERSION,
    },
  },

  operators: {
    path: "operators", table: "operators", label: "operator",
    roles: { read: ALL, write: PLANNERS, delete: LEAD },
    fields: {
      id: SERVER_ID,
      operator_code: { type: "string", label: "Code", required: true },
      name: { type: "string", label: "Name", required: true },
      role: { type: "enum", label: "Role", values: OPERATOR_ROLES },
      is_active: { type: "boolean", label: "Active" },
      code_number: { type: "integer", label: "Code # (run code)", nullable: true, min: 0 },
      version: VERSION,
    },
  },

  labs: {
    path: "labs", table: "labs", label: "lab",
    roles: { read: ALL, write: PLANNERS, delete: LEAD },
    fields: {
      id: SERVER_ID,
      name: { type: "string", label: "Name", required: true },
      type: { type: "enum", label: "Type", values: LAB_TYPES },
      is_available: { type: "boolean", label: "Available" },
      capacity: { type: "integer", label: "Capacity (runs/day)", min: 0 },
      code_number: { type: "integer", label: "Code # (run code)", nullable: true, min: 0 },
      version: VERSION,
    },
  },

  "lab-blackouts": {
    // Readiness has always honoured these; until now nothing could write them.
    path: "lab-blackouts", table: "lab_blackouts", label: "lab blackout",
    roles: { read: ALL, write: PLANNERS, delete: PLANNERS },
    fields: {
      id: SERVER_ID,
      lab_id: parent("Lab"),
      blackout_date: { type: "date", label: "Date", required: true },
      slot_time: { type: "time", label: "Slot (blank = whole day)", nullable: true },
      reason: { type: "text", label: "Reason", nullable: true },
      version: VERSION,
    },
  },

  sensors: {
    path: "sensors", table: "sensors", label: "sensor",
    roles: { read: ALL, write: PLANNERS, delete: LEAD },
    fields: {
      id: SERVER_ID,
      asset_name: { type: "string", label: "Asset name", required: true },
      sensor_type: { type: "string", label: "Type", required: true, suggestions: SENSOR_TYPES },
      status: { type: "enum", label: "Status", values: SENSOR_STATUSES },
      current_campaign_id: { type: "id", label: "Current campaign", nullable: true },
      version: VERSION,
    },
  },

  "sensor-rigs": {
    path: "sensor-rigs", table: "sensor_rigs", label: "sensor rig",
    roles: { read: ALL, write: PLANNERS, delete: LEAD },
    fields: {
      id: SERVER_ID,
      campaign_id: parent("Campaign"),
      name: { type: "string", label: "Name", required: true },
      sensor_ids: { type: "id[]", label: "Sensors" },
      qa_profile: { type: "json", label: "QA expectation profile", readonly: "not yet editable through the API" },
      version: VERSION,
    },
  },

  "inventory-items": {
    path: "inventory-items", table: "inventory_items", label: "inventory item",
    roles: { read: ALL, write: PLANNERS, delete: PLANNERS },
    fields: {
      id: SERVER_ID,
      campaign_id: parent("Campaign"),
      name: { type: "string", label: "Name", required: true },
      kind: { type: "enum", label: "Kind", values: INVENTORY_KINDS, required: true },
      quantity: { type: "number", label: "Quantity", min: 0 },
      unit: { type: "string", label: "Unit" },
      status: { type: "enum", label: "Status", values: INVENTORY_STATUSES },
      is_available: derived("boolean", "Available", "status"),
      version: VERSION,
    },
  },

  users: {
    path: "users", table: "users", label: "user",
    roles: { read: ALL, write: LEAD, delete: LEAD },
    fields: {
      id: SERVER_ID,
      subject: { type: "string", label: "Login", required: true },
      name: { type: "string", label: "Name", required: true },
      email: { type: "string", label: "Email (used to sign in)", nullable: true },
      role: { type: "enum", label: "Role", values: ROLES },
      is_active: { type: "boolean", label: "Active" },
      version: VERSION,
    },
  },

  runs: {
    // Operators write here — execution is their job. The planning actions nested
    // under /runs carry their own route-level gate in the API.
    path: "runs", table: "runs", label: "run",
    roles: { read: ALL, write: ALL, delete: PLANNERS },
    fields: {
      id: SERVER_ID,
      campaign_id: parent("Campaign"),
      slot_date: { type: "date", label: "Date", nullable: true },
      slot_time: { type: "time", label: "Start", nullable: true },
      mission_scope: { type: "enum", label: "Mission scope", values: MISSION_SCOPES },
      mission_group_id: { type: "id", label: "Mission group", nullable: true },
      mission_ids: { type: "id[]", label: "Missions" },
      robot_id: { type: "id", label: "Robot", nullable: true },
      operator_id: { type: "id", label: "Operator", nullable: true },
      lab_id: { type: "id", label: "Lab", nullable: true },
      sensor_rig_id: { type: "id", label: "Sensor rig", nullable: true },
      notes: { type: "text", label: "Notes", nullable: true },
      payload: { type: "string", label: "Payload", nullable: true },
      run_lab: { type: "string", label: "Run lab note", nullable: true },
      state: { type: "enum", label: "State", values: RUN_STATES, readonly: "derived from assembly and readiness; changed by Confirm and Advance" },
      provisional_code: { type: "string", label: "Provisional code", readonly: "minted from the slot date" },
      encoded_code: { type: "string", label: "Run code", readonly: "minted when the run is confirmed" },
      run_seq: { type: "integer", label: "Sequence", readonly: "assigned when the run is confirmed" },
      mission_reps: { type: "json", label: "Planned reps", readonly: "set by the auto-scheduler proposal" },
      completed_mission_ids: { type: "id[]", label: "Completed missions", readonly: "set by uploading the run sheet" },
      collected_rows: { type: "json", label: "Collected rows", readonly: "set by uploading the run sheet" },
      execution_log: { type: "json", label: "Execution log", readonly: "set per mission during execution (PUT /runs/:id/execution/:missionId)" },
      coverage_cell: { type: "json", label: "Coverage cell", readonly: "set on the run (PUT /runs/:id/coverage-cell)" },
      version: VERSION,
    },
  },

  documents: {
    // Created by uploading a file (POST /documents); metadata is editable after.
    path: "documents", table: "documents", label: "document",
    roles: { read: ALL, write: ALL, delete: PLANNERS },
    fields: {
      id: SERVER_ID,
      filename: { type: "string", label: "Filename", required: true },
      vault_category: { type: "enum", label: "Category", values: DOCUMENT_CATEGORIES },
      status: { type: "enum", label: "Status", values: DOCUMENT_STATUSES },
      linked_entity_type: { type: "string", label: "Linked to (type)", nullable: true },
      linked_entity_id: { type: "id", label: "Linked to (id)", nullable: true },
      mime_type: { type: "string", label: "MIME type", readonly: "recorded at upload" },
      file_path: { type: "string", label: "Storage key", readonly: "assigned at upload" },
      doc_metadata: { type: "json", label: "File metadata", readonly: "recorded at upload" },
      version: VERSION,
    },
  },

  workflows: {
    // BPMN diagrams. Every save keeps the replaced diagram (GET /workflows/:id/versions).
    path: "workflows", table: "workflows", label: "workflow",
    roles: { read: ALL, write: PLANNERS, delete: PLANNERS },
    fields: {
      id: SERVER_ID,
      name: { type: "string", label: "Name", required: true },
      xml: { type: "text", label: "BPMN 2.0 XML" },
      version: VERSION,
    },
  },
} satisfies Record<string, ResourceSpec>;

export type ResourceName = keyof typeof RESOURCES;
