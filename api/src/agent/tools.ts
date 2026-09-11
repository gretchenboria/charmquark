/**
 * The agent tool registry — one definition, used by the MCP server (Claude Code,
 * Gemini CLI, any MCP client) and by Charmy in the app.
 *
 * A tool never touches the database. It describes an HTTP call to this same API,
 * which the caller runs with the agent's own credentials. So an agent passes
 * through exactly the authentication, role policy, validation, If-Match and
 * audit trail a person does, and can never do more than its user.
 *
 * Pure (no Worker APIs) so it is unit-tested directly.
 */
import { RESOURCES, SETTING_DEFAULTS, SETTING_SPECS, type SettingKey } from "../../../packages/contracts/src/index.ts";

export interface ToolCall {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path under /api, e.g. "/labs/123". */
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AgentTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  /** Can change data. */
  mutates: boolean;
  /** Where a person does the same thing by hand — nothing is agent-only. */
  uiPath: string;
  /** Offered to the in-app assistant, which only reads and proposes; a person applies. */
  inApp: boolean;
  /** The API call to make, or a result computed locally. Throws ToolArgError on bad input. */
  plan: (args: Record<string, unknown>) => ToolCall | { local: unknown };
}

export class ToolArgError extends Error {}

const RESOURCE_NAMES = Object.keys(RESOURCES);

const need = (args: Record<string, unknown>, key: string): string => {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) throw new ToolArgError(`${key} is required`);
  return encodeURIComponent(v.trim());
};
const resourceArg = (args: Record<string, unknown>): string => {
  const r = args["resource"];
  if (typeof r !== "string" || !RESOURCE_NAMES.includes(r)) {
    throw new ToolArgError(`resource must be one of ${RESOURCE_NAMES.join(", ")}`);
  }
  return r;
};
const qs = (pairs: Record<string, unknown>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(pairs)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

const obj = (properties: Record<string, unknown>, required: string[] = []): JsonSchema =>
  ({ type: "object", properties, required, additionalProperties: false });
const S = (description: string) => ({ type: "string", description });
const resourceProp = { type: "string", enum: RESOURCE_NAMES, description: "Record type (see describe_schema)." };

/** Registry summary an agent reads first: what exists, what is writable, and why not. */
export function describeSchema(resource?: string): unknown {
  const pick = resource && resource in RESOURCES ? { [resource]: RESOURCES[resource as keyof typeof RESOURCES] } : RESOURCES;
  return {
    how_to_change_things:
      "Use propose_changes with a list of edits, read the diff and problems, then apply_changes with the returned id. " +
      "Send if_match (the record's version) on updates so you never overwrite someone else's edit.",
    resources: Object.fromEntries(Object.entries(pick).map(([name, spec]) => [name, {
      label: spec.label,
      roles: spec.roles,
      fields: spec.fields,
    }])),
    settings: Object.fromEntries((Object.keys(SETTING_SPECS) as SettingKey[]).map((k) => [k, {
      label: SETTING_SPECS[k].label, description: SETTING_SPECS[k].description, default: SETTING_DEFAULTS[k],
    }])),
  };
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "describe_schema", title: "Describe the data model",
    description: "Every record type with its fields, which are writable, why read-only ones are locked, who may change what, and the deployment settings. Call this first.",
    inputSchema: obj({ resource: { ...resourceProp, description: "Optional: only this record type." } }),
    mutates: false, uiPath: "/api-reference", inApp: true,
    plan: (a) => ({ local: describeSchema(typeof a["resource"] === "string" ? a["resource"] : undefined) }),
  },
  {
    name: "list_records", title: "List records",
    description: "All records of a type (labs, robots, missions, runs, …).",
    inputSchema: obj({ resource: resourceProp }, ["resource"]),
    mutates: false, uiPath: "/<resource>", inApp: true,
    plan: (a) => ({ method: "GET", path: `/${resourceArg(a)}` }),
  },
  {
    name: "get_record", title: "Get one record",
    description: "One record by id, including its version (send it as if_match when changing it).",
    inputSchema: obj({ resource: resourceProp, id: S("Record id.") }, ["resource", "id"]),
    mutates: false, uiPath: "/<resource>/<id>", inApp: true,
    plan: (a) => ({ method: "GET", path: `/${resourceArg(a)}/${need(a, "id")}` }),
  },
  {
    name: "get_run_readiness", title: "Why is a run (not) ready",
    description: "Every readiness issue blocking a run from being confirmed.",
    inputSchema: obj({ run_id: S("Run id.") }, ["run_id"]),
    mutates: false, uiPath: "/runs/<id>", inApp: true,
    plan: (a) => ({ method: "GET", path: `/runs/${need(a, "run_id")}/readiness` }),
  },
  {
    name: "get_audit_log", title: "Recent changes",
    description: "Who changed what and when (people and agents), newest first.",
    inputSchema: obj({ resource: resourceProp, entity_id: S("Optional record id."), limit: { type: "integer", minimum: 1, maximum: 200 } }),
    mutates: false, uiPath: "/<resource>/<id> (Activity)", inApp: true,
    plan: (a) => ({ method: "GET", path: `/audit${qs({ resource: a["resource"], entity_id: a["entity_id"], limit: a["limit"] })}` }),
  },
  {
    name: "get_settings", title: "Deployment settings",
    description: "Scheduling, risk and limit rules with current values and defaults.",
    inputSchema: obj({}),
    mutates: false, uiPath: "/settings", inApp: true,
    plan: () => ({ method: "GET", path: "/settings" }),
  },
  {
    name: "propose_changes", title: "Propose a change set",
    description:
      "Preview a batch of edits without writing anything. Each change is {resource, op: create|update|delete, id?, ref?, data?, if_match?}; " +
      "a create may set ref and later edits may use \"$ref:<name>\" as an id. Returns an id, a per-field diff, and every problem. Nothing changes until apply_changes.",
    inputSchema: obj({
      summary: S("One line describing the intent, shown to reviewers."),
      changes: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } },
    }, ["changes"]),
    mutates: false, uiPath: "/<resource>/<id> (edit fields in place)", inApp: true,
    plan: (a) => {
      if (!Array.isArray(a["changes"])) throw new ToolArgError("changes must be a list");
      return { method: "POST", path: "/changesets/preview", body: { summary: a["summary"], changes: a["changes"] } };
    },
  },
  {
    name: "apply_changes", title: "Apply a proposed change set",
    description: "Apply a previewed change set atomically, as you. Refused if any record changed since the preview.",
    inputSchema: obj({ changeset_id: S("Id returned by propose_changes.") }, ["changeset_id"]),
    mutates: true, uiPath: "/<resource>/<id> (edit fields in place)", inApp: false,
    plan: (a) => ({ method: "POST", path: `/changesets/${need(a, "changeset_id")}/apply` }),
  },
  {
    name: "update_settings", title: "Change deployment settings",
    description: "Set settings, e.g. {\"scheduling.run_effort_budget\": 6}; null resets a key. Validated together. Fleet Lead only.",
    inputSchema: obj({ changes: { type: "object" } }, ["changes"]),
    mutates: true, uiPath: "/settings", inApp: false,
    plan: (a) => {
      if (!a["changes"] || typeof a["changes"] !== "object") throw new ToolArgError("changes must be an object");
      return { method: "PATCH", path: "/settings", body: a["changes"] };
    },
  },
  {
    name: "propose_runs", title: "Draft a packed run",
    description: "Create a draft run filled with schedulable missions up to the effort budget (the auto-scheduler).",
    inputSchema: obj({ campaign_id: S("Campaign id."), slot_date: S("Optional YYYY-MM-DD."), slot_time: S("Optional HH:MM.") }, ["campaign_id"]),
    mutates: true, uiPath: "/auto-schedule", inApp: false,
    plan: (a) => ({ method: "POST", path: "/run-proposals", body: { campaign_id: a["campaign_id"], slot_date: a["slot_date"], slot_time: a["slot_time"] } }),
  },
  {
    name: "confirm_run", title: "Confirm a run",
    description: "Confirm a READY run: books the lab slot and spends one run credit. PM or Fleet Lead.",
    inputSchema: obj({ run_id: S("Run id.") }, ["run_id"]),
    mutates: true, uiPath: "/schedule", inApp: false,
    plan: (a) => ({ method: "POST", path: `/runs/${need(a, "run_id")}/confirm`, body: {} }),
  },
  {
    name: "assess_risk", title: "Assess a mission's risk",
    description: "Classify a mission's hazard level; POTENTIAL/HIGH routes it to Fleet Lead legal review.",
    inputSchema: obj({ mission_id: S("Mission id.") }, ["mission_id"]),
    mutates: true, uiPath: "/missions/<id>", inApp: false,
    plan: (a) => ({ method: "POST", path: `/missions/${need(a, "mission_id")}/assess-risk`, body: {} }),
  },
  {
    name: "list_workflows", title: "List workflows",
    description: "BPMN workflow diagrams.",
    inputSchema: obj({}),
    mutates: false, uiPath: "/workflows/designer", inApp: true,
    plan: () => ({ method: "GET", path: "/workflows" }),
  },
  {
    name: "get_workflow", title: "Get a workflow",
    description: "A workflow's BPMN 2.0 XML and version.",
    inputSchema: obj({ id: S("Workflow id.") }, ["id"]),
    mutates: false, uiPath: "/workflows/designer", inApp: true,
    plan: (a) => ({ method: "GET", path: `/workflows/${need(a, "id")}` }),
  },
  {
    name: "save_workflow", title: "Create or update a workflow",
    description: "Without id: create {name, xml?}. With id: rename and/or replace the BPMN XML; send if_match. The replaced diagram is kept as a version.",
    inputSchema: obj({ id: S("Omit to create."), name: S("Workflow name."), xml: S("BPMN 2.0 XML."), if_match: { type: "integer" } }),
    mutates: true, uiPath: "/workflows/designer", inApp: false,
    plan: (a) => {
      const body: Record<string, unknown> = {};
      if (typeof a["name"] === "string") body["name"] = a["name"];
      if (typeof a["xml"] === "string") body["xml"] = a["xml"];
      if (a["id"] === undefined) {
        if (!body["name"]) throw new ToolArgError("name is required to create a workflow");
        return { method: "POST", path: "/workflows", body };
      }
      if (!Object.keys(body).length) throw new ToolArgError("send name and/or xml to change");
      const headers = typeof a["if_match"] === "number" ? { "If-Match": String(a["if_match"]) } : undefined;
      return { method: "PATCH", path: `/workflows/${need(a, "id")}`, body, headers };
    },
  },
];

export const toolByName = (name: string): AgentTool | undefined => AGENT_TOOLS.find((t) => t.name === name);
