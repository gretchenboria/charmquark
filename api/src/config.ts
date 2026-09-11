/**
 * Planning a config bundle against a deployment: which records to create, update
 * or delete, which settings change, which workflows change. It works on data only,
 * with no database or Worker APIs, so it is unit-tested directly. The route checks
 * each record edit with the change-set engine and applies what this returns.
 *
 * Nothing is deleted unless the caller asks for `prune`. An update carries the
 * bundle's version as if_match, so editing a stale export fails rather than
 * overwriting a newer change.
 */
import {
  CONFIG_FORMAT, CONFIG_NATURAL_KEYS, CONFIG_RESOURCES, canonicalJson, isConfigResource, isSettingKey, validateSettings,
  type ConfigResource, type Settings,
} from "../../packages/contracts/src/index.ts";

export interface ConfigState {
  records: Record<ConfigResource, Record<string, unknown>[]>;
  settings: Settings;
  workflows: { id: string; name: string; xml: string; version: number }[];
}

export interface RecordChange {
  resource: ConfigResource;
  op: "create" | "update" | "delete";
  id?: string;
  ref?: string;
  data?: Record<string, unknown>;
  if_match?: number;
}
export interface SettingChange { key: string; from: unknown; to: unknown }
export interface WorkflowChange {
  op: "create" | "update" | "delete";
  id: string | null;
  name: string;
  xml?: string;
  xml_changed: boolean;
  name_changed: boolean;
  if_match?: number;
}
export interface ConfigPlan {
  problems: string[];
  records: RecordChange[];
  settings: SettingChange[];
  workflows: WorkflowChange[];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

export function planConfig(raw: unknown, current: ConfigState, opts: { prune?: boolean } = {}): ConfigPlan {
  const plan: ConfigPlan = { problems: [], records: [], settings: [], workflows: [] };
  const problem = (msg: string) => plan.problems.push(msg);

  if (!isObject(raw)) {
    problem("the bundle must be a JSON object");
    return plan;
  }
  if (raw["format"] !== CONFIG_FORMAT) {
    problem(`format must be "${CONFIG_FORMAT}" (export a bundle to start from)`);
    return plan;
  }
  for (const key of Object.keys(raw)) {
    if (!["format", "exported_at", "settings", "records", "workflows"].includes(key)) problem(`unknown top-level key ${key}`);
  }

  // ---------------------------------------------------------------- records
  const deletes: RecordChange[] = [];
  if (raw["records"] !== undefined) {
    const records = raw["records"];
    if (!isObject(records)) {
      problem("records must be an object of record lists");
    } else {
      for (const key of Object.keys(records)) {
        if (!isConfigResource(key)) problem(`records.${key} is not a record type (use one of ${CONFIG_RESOURCES.join(", ")})`);
      }
      for (const resource of CONFIG_RESOURCES) {
        const list = records[resource];
        if (list === undefined) continue;
        if (!Array.isArray(list)) {
          problem(`records.${resource} must be a list`);
          continue;
        }
        const byId = new Map(current.records[resource].map((r) => [String(r["id"]), r]));
        const seen = new Set<string>();
        const keyFields = CONFIG_NATURAL_KEYS[resource];
        const naturalKey = (r: Record<string, unknown>) => canonicalJson(keyFields.map((k) => r[k] ?? null));
        const existingKeys = new Map(current.records[resource].map((r) => [naturalKey(r), String(r["id"])]));
        const newKeys = new Set<string>();
        list.forEach((item, i) => {
          const at = `records.${resource}[${i}]`;
          if (!isObject(item)) {
            problem(`${at} must be an object`);
            return;
          }
          const { id, version, ref, ...data } = item;
          if (id === undefined || id === null || id === "") {
            // A key that points at another new record ("$ref:") cannot match an existing one.
            if (!keyFields.some((k) => typeof data[k] === "string" && (data[k] as string).startsWith("$ref:"))) {
              const key = naturalKey(data);
              const label = keyFields.map((k) => `${k} ${JSON.stringify(data[k] ?? null)}`).join(", ");
              const existing = existingKeys.get(key);
              if (existing) problem(`${at}: a ${resource} record with ${label} already exists (id ${existing}); add that id to update it, or pull to refresh your files`);
              else if (newKeys.has(key)) problem(`${at}: two new ${resource} records have ${label}`);
              newKeys.add(key);
            }
            const change: RecordChange = { resource, op: "create", data };
            if (typeof ref === "string") change.ref = ref;
            else if (ref !== undefined) problem(`${at}.ref must be a string`);
            plan.records.push(change);
            return;
          }
          if (typeof id !== "string") {
            problem(`${at}.id must be a string`);
            return;
          }
          if (seen.has(id)) {
            problem(`${at}: ${resource} ${id} appears twice`);
            return;
          }
          seen.add(id);
          const cur = byId.get(id);
          if (!cur) {
            problem(`${at}: ${resource} ${id} does not exist here (it was deleted, or the bundle is from another deployment); remove id to create it`);
            return;
          }
          if (ref !== undefined) problem(`${at}.ref only applies to new records`);
          if (version !== undefined && !Number.isInteger(version)) problem(`${at}.version must be a whole number`);
          const changed = Object.fromEntries(Object.entries(data).filter(([k, v]) => !same(v, cur[k])));
          if (!Object.keys(changed).length) return;
          const change: RecordChange = { resource, op: "update", id, data: changed };
          if (Number.isInteger(version)) change.if_match = version as number;
          plan.records.push(change);
        });
        if (opts.prune) {
          for (const r of current.records[resource]) {
            const id = String(r["id"]);
            if (!seen.has(id)) deletes.push({ resource, op: "delete", id, if_match: Number(r["version"]) });
          }
        }
      }
    }
  }
  // Children go before their parents when deleting.
  deletes.sort((a, b) => CONFIG_RESOURCES.indexOf(b.resource) - CONFIG_RESOURCES.indexOf(a.resource));
  plan.records.push(...deletes);

  // ---------------------------------------------------------------- settings
  if (raw["settings"] !== undefined) {
    const settings = raw["settings"];
    if (!isObject(settings)) {
      problem("settings must be an object of setting keys to values");
    } else {
      const merged = structuredClone(current.settings) as unknown as Record<string, unknown>;
      let known = true;
      for (const [key, value] of Object.entries(settings)) {
        if (!isSettingKey(key)) {
          problem(`settings.${key} is not a setting`);
          known = false;
          continue;
        }
        if (same(value, merged[key])) continue;
        plan.settings.push({ key, from: merged[key], to: value });
        merged[key] = value;
      }
      if (known && plan.settings.length) {
        for (const e of validateSettings(merged as unknown as Settings)) problem(`settings.${e.field} ${e.message}`);
      }
    }
  }

  // ---------------------------------------------------------------- workflows
  if (raw["workflows"] !== undefined) {
    const workflows = raw["workflows"];
    if (!Array.isArray(workflows)) {
      problem("workflows must be a list");
    } else {
      const byId = new Map(current.workflows.map((w) => [w.id, w]));
      const seen = new Set<string>();
      workflows.forEach((w, i) => {
        const at = `workflows[${i}]`;
        if (!isObject(w) || typeof w["name"] !== "string" || !w["name"].trim() || typeof w["xml"] !== "string") {
          problem(`${at} needs a name and xml`);
          return;
        }
        const name = w["name"].trim();
        const xml = w["xml"];
        const id = w["id"];
        if (id === undefined || id === null || id === "") {
          plan.workflows.push({ op: "create", id: null, name, xml, xml_changed: true, name_changed: true });
          return;
        }
        if (typeof id !== "string" || !byId.has(id)) {
          problem(`${at}: workflow ${String(id)} does not exist here; remove id to create it`);
          return;
        }
        if (seen.has(id)) {
          problem(`${at}: workflow ${id} appears twice`);
          return;
        }
        seen.add(id);
        const cur = byId.get(id)!;
        if (Number.isInteger(w["version"]) && w["version"] !== cur.version) {
          problem(`${at}: workflow "${cur.name}" is now at version ${cur.version}, not ${String(w["version"])}; someone changed it since you exported, so pull again`);
        }
        const xmlChanged = xml !== cur.xml;
        const nameChanged = name !== cur.name;
        if (!xmlChanged && !nameChanged) return;
        const change: WorkflowChange = { op: "update", id, name, xml_changed: xmlChanged, name_changed: nameChanged };
        if (xmlChanged) change.xml = xml;
        if (Number.isInteger(w["version"])) change.if_match = w["version"] as number;
        plan.workflows.push(change);
      });
      if (opts.prune) {
        for (const w of current.workflows) {
          if (!seen.has(w.id)) plan.workflows.push({ op: "delete", id: w.id, name: w.name, xml_changed: false, name_changed: false, if_match: w.version });
        }
      }
    }
  }
  return plan;
}

/** A hash of what a plan would change. Apply refuses a digest that no longer matches. */
export async function planDigest(plan: ConfigPlan): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson({ records: plan.records, settings: plan.settings, workflows: plan.workflows }));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
