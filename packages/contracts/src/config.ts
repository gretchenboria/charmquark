/**
 * Config bundles: a deployment's configuration as one JSON document a person or an
 * agent can edit, plan and apply (GET /api/config/export, POST /api/config/plan,
 * POST /api/config/apply). The `cq` CLI in templates/customer-config lays a bundle
 * out as files (settings.json, records/<resource>.json, workflows/*.bpmn).
 *
 * A bundle record carries its id and version. Leave the id out to create a record;
 * the version pins an update, so a bundle exported before someone else's edit is
 * refused instead of overwriting it. JSON Schemas for every file are generated
 * from the registry here, so editors and agents validate against the same rules
 * the API enforces.
 */
import { RESOURCES, type ResourceSpec } from "./resources.ts";
import { writableFields, type FieldSpec } from "./fields.ts";
import { SETTING_DEFAULTS, SETTING_KEYS, SETTING_SPECS } from "./settings.ts";

export const CONFIG_FORMAT = "charmquark.config/1";

/** Record types a bundle holds, parents before children so "$ref:" names resolve. */
export const CONFIG_RESOURCES = [
  "campaigns", "labs", "robots", "operators", "sensors",
  "mission-groups", "lab-blackouts", "sensor-rigs", "inventory-items", "missions",
] as const;
export type ConfigResource = (typeof CONFIG_RESOURCES)[number];

export const isConfigResource = (r: string): r is ConfigResource => (CONFIG_RESOURCES as readonly string[]).includes(r);

/**
 * What names a record to a person. A new record (no id) whose natural key matches
 * an existing one is refused, so applying the same bundle twice, or a bundle whose
 * ids were never pulled back, cannot create duplicates.
 */
export const CONFIG_NATURAL_KEYS: Record<ConfigResource, readonly string[]> = {
  campaigns: ["name"],
  labs: ["name"],
  robots: ["robot_code"],
  operators: ["operator_code"],
  sensors: ["asset_name"],
  "mission-groups": ["campaign_id", "name"],
  "lab-blackouts": ["lab_id", "blackout_date", "slot_time"],
  "sensor-rigs": ["campaign_id", "name"],
  "inventory-items": ["campaign_id", "name"],
  missions: ["campaign_id", "mission_code"],
};

export interface ConfigWorkflow { id?: string; version?: number; name: string; xml: string }

export interface ConfigBundle {
  format: typeof CONFIG_FORMAT;
  exported_at?: string;
  settings?: Record<string, unknown>;
  records?: Partial<Record<ConfigResource, Record<string, unknown>[]>>;
  workflows?: ConfigWorkflow[];
}

const specOf = (resource: ConfigResource) => RESOURCES[resource] as ResourceSpec;

/** Keys a bundle record carries: id, version and the fields writable on create. */
export function configFields(resource: ConfigResource): string[] {
  return ["id", "version", ...writableFields(specOf(resource).fields, "create")];
}

/** A record as it appears in a bundle. */
export function projectRecord(resource: ConfigResource, record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of configFields(resource)) if (key in record) out[key] = record[key] ?? null;
  return out;
}

/** JSON with object keys sorted, so the same data always compares and hashes the same. */
export function canonicalJson(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]));
    }
    return v === undefined ? null : v;
  };
  return JSON.stringify(norm(value));
}

// ---------------------------------------------------------------- JSON Schemas

export type JsonSchemaDoc = Record<string, unknown>;

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

function fieldSchema(f: FieldSpec): JsonSchemaDoc {
  let s: JsonSchemaDoc;
  switch (f.type) {
    case "integer":
    case "number":
      s = { type: f.type, ...(f.min !== undefined ? { minimum: f.min } : {}) };
      break;
    case "boolean":
      s = { type: "boolean" };
      break;
    case "enum":
      s = { type: "string", enum: [...(f.values ?? [])] };
      break;
    case "date":
      s = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
      break;
    case "time":
      s = { type: "string", pattern: "^\\d{2}:\\d{2}$" };
      break;
    case "id[]":
      s = { type: "array", items: { type: "string" } };
      break;
    case "json":
      s = {};
      break;
    default:
      s = { type: "string" };
  }
  if (f.nullable && typeof s["type"] === "string") {
    s = { ...s, type: [s["type"], "null"], ...(Array.isArray(s["enum"]) ? { enum: [...(s["enum"] as unknown[]), null] } : {}) };
  }
  const notes = [f.required ? "Required for a new record." : "", f.createOnly ? "Set when the record is created; fixed after." : ""].filter(Boolean);
  return { title: f.label, ...(notes.length ? { description: notes.join(" ") } : {}), ...s };
}

function recordItemSchema(resource: ConfigResource): JsonSchemaDoc {
  const spec = specOf(resource);
  const properties: Record<string, JsonSchemaDoc> = {
    id: { type: "string", description: "The record's id. Leave out to create a new record." },
    version: { type: "integer", description: "The version you exported. The apply is refused if the record changed since." },
    ref: {
      type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$",
      description: "New records only: a name other records in the bundle use as \"$ref:<name>\" in place of this record's id.",
    },
  };
  for (const key of writableFields(spec.fields, "create")) properties[key] = fieldSchema(spec.fields[key]!);
  return { type: "object", title: spec.label, properties, additionalProperties: false };
}

const valueSchema = (v: unknown): JsonSchemaDoc =>
  Array.isArray(v) ? { type: "array", items: v.length ? valueSchema(v[0]) : {} }
    : v && typeof v === "object" ? { type: "object" }
      : typeof v === "number" ? { type: "number" }
        : typeof v === "boolean" ? { type: "boolean" }
          : typeof v === "string" ? { type: "string" } : {};

function settingsSchema(): JsonSchemaDoc {
  return {
    type: "object",
    title: "CharmQuark deployment settings",
    properties: Object.fromEntries(SETTING_KEYS.map((k) => [k, {
      title: SETTING_SPECS[k].label, description: SETTING_SPECS[k].description, ...valueSchema(SETTING_DEFAULTS[k]),
    }])),
    additionalProperties: false,
  };
}

const workflowIndexItem: JsonSchemaDoc = {
  type: "object",
  properties: {
    file: { type: "string", pattern: "^[A-Za-z0-9_.-]+\\.bpmn$", description: "The .bpmn file next to this index." },
    id: { type: "string", description: "Leave out for a new workflow." },
    version: { type: "integer" },
    name: { type: "string" },
  },
  required: ["file", "name"],
  additionalProperties: false,
};

/**
 * Schemas for every file the CLI writes, keyed by path, plus `bundle.json` for the
 * API request body.
 */
export function configSchemas(): Record<string, JsonSchemaDoc> {
  const out: Record<string, JsonSchemaDoc> = {
    "settings.json": { $schema: DRAFT, ...settingsSchema() },
    "workflows/index.json": { $schema: DRAFT, title: "CharmQuark workflows", type: "array", items: workflowIndexItem },
  };
  for (const r of CONFIG_RESOURCES) {
    out[`records/${r}.json`] = { $schema: DRAFT, title: `CharmQuark ${specOf(r).label} records`, type: "array", items: recordItemSchema(r) };
  }
  out["bundle.json"] = {
    $schema: DRAFT,
    title: "CharmQuark config bundle",
    type: "object",
    properties: {
      format: { type: "string", enum: [CONFIG_FORMAT] },
      exported_at: { type: "string" },
      settings: settingsSchema(),
      records: {
        type: "object",
        properties: Object.fromEntries(CONFIG_RESOURCES.map((r) => [r, { type: "array", items: recordItemSchema(r) }])),
        additionalProperties: false,
      },
      workflows: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, version: { type: "integer" }, name: { type: "string" }, xml: { type: "string" } },
          required: ["name", "xml"],
          additionalProperties: false,
        },
      },
    },
    required: ["format"],
    additionalProperties: false,
  };
  return out;
}
