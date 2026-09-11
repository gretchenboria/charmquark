#!/usr/bin/env node
/**
 * cq: a CharmQuark deployment's configuration as files you edit and review in git.
 *
 *   node cq.mjs pull              write the deployment's configuration into this folder
 *   node cq.mjs validate          check the files against schemas/ (no network)
 *   node cq.mjs plan [--prune]    show what apply would change; nothing is written
 *   node cq.mjs apply [--prune]   apply exactly what you planned, then pull fresh ids and versions
 *
 * Environment:
 *   CHARMQUARK_URL    https://<your deployment>
 *   CHARMQUARK_TOKEN  an API token from Settings → API tokens (plan and apply need "can make changes")
 *
 * No dependencies: Node 20 or later.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const FORMAT = "charmquark.config/1";
const STATE = ".cq/plan.json";

// ---------------------------------------------------------------- files

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json(value));
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    throw new Error(`${path}: ${err instanceof SyntaxError ? `not valid JSON (${err.message})` : err.message}`);
  }
}

export const slug = (name) =>
  String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "workflow";

/** Lay a bundle (and the schemas) out as files, replacing what `pull` wrote before. */
export async function writeBundle(dir, bundle, schemas = {}) {
  await writeJson(join(dir, "settings.json"), bundle.settings ?? {});

  await rm(join(dir, "records"), { recursive: true, force: true });
  for (const [resource, list] of Object.entries(bundle.records ?? {})) {
    await writeJson(join(dir, "records", `${resource}.json`), list);
  }

  await rm(join(dir, "workflows"), { recursive: true, force: true });
  await mkdir(join(dir, "workflows"), { recursive: true });
  const used = new Set();
  const index = [];
  for (const w of bundle.workflows ?? []) {
    let file = `${slug(w.name)}.bpmn`;
    for (let n = 2; used.has(file); n++) file = `${slug(w.name)}-${n}.bpmn`;
    used.add(file);
    await writeFile(join(dir, "workflows", file), w.xml);
    index.push({ file, id: w.id, version: w.version, name: w.name });
  }
  await writeJson(join(dir, "workflows", "index.json"), index);

  await rm(join(dir, "schemas"), { recursive: true, force: true });
  for (const [path, schema] of Object.entries(schemas)) await writeJson(join(dir, "schemas", path), schema);

  // Editor validation for every file that has a schema.
  const vscode = join(dir, ".vscode", "settings.json");
  const editor = existsSync(vscode) ? await readJson(vscode).catch(() => ({})) : {};
  editor["json.schemas"] = Object.keys(schemas)
    .filter((p) => p !== "bundle.json")
    .map((p) => ({ fileMatch: [`/${p}`], url: `./schemas/${p}` }));
  await writeJson(vscode, editor);
}

/** Read the files back into a bundle. */
export async function readBundle(dir) {
  const bundle = { format: FORMAT };
  if (existsSync(join(dir, "settings.json"))) bundle.settings = await readJson(join(dir, "settings.json"));
  if (existsSync(join(dir, "records"))) {
    bundle.records = {};
    for (const file of (await readdir(join(dir, "records"))).filter((f) => f.endsWith(".json")).sort()) {
      bundle.records[file.slice(0, -5)] = await readJson(join(dir, "records", file));
    }
  }
  const indexPath = join(dir, "workflows", "index.json");
  if (existsSync(indexPath)) {
    const index = await readJson(indexPath);
    if (!Array.isArray(index)) throw new Error(`${indexPath}: must be a list`);
    bundle.workflows = [];
    for (const entry of index) {
      const path = join(dir, "workflows", String(entry.file));
      if (!existsSync(path)) throw new Error(`${indexPath}: ${entry.file} does not exist`);
      const w = { name: entry.name, xml: await readFile(path, "utf8") };
      if (entry.id) w.id = entry.id;
      if (entry.version !== undefined) w.version = entry.version;
      bundle.workflows.push(w);
    }
  }
  return bundle;
}

// ---------------------------------------------------------------- local validation

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

/** The JSON Schema subset the deployment's schemas use. Returns problems as "path: message". */
export function validateValue(schema, value, path = "$") {
  const out = [];
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const fits = types.some((t) => t === actual || (t === "integer" && Number.isInteger(value)) || (t === "number" && actual === "number"));
    if (!fits) return [`${path}: must be ${types.join(" or ")}`];
  }
  if (schema.enum && !schema.enum.includes(value)) out.push(`${path}: must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${path}: must match ${schema.pattern}`);
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) out.push(`${path}: must be at least ${schema.minimum}`);
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) out.push(`${path}: ${key} is required`);
    for (const [key, v] of Object.entries(value)) {
      if (schema.properties?.[key]) out.push(...validateValue(schema.properties[key], v, `${path}.${key}`));
      else if (schema.additionalProperties === false) out.push(`${path}: ${key} is not a field you can set here`);
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => out.push(...validateValue(schema.items, v, `${path}[${i}]`)));
  return out;
}

/** Check every file against schemas/. */
export async function validateDir(dir) {
  const problems = [];
  const check = async (file) => {
    const schemaPath = join(dir, "schemas", file);
    if (!existsSync(join(dir, file))) return;
    if (!existsSync(schemaPath)) return problems.push(`${file}: no schema for this file (is it a record type the deployment knows? run pull)`);
    try {
      const [schema, value] = [await readJson(schemaPath), await readJson(join(dir, file))];
      problems.push(...validateValue(schema, value).map((p) => `${file} ${p.replace(/^\$/, "")}`));
    } catch (err) {
      problems.push(err.message);
    }
  };
  await check("settings.json");
  if (existsSync(join(dir, "records"))) {
    for (const f of (await readdir(join(dir, "records"))).filter((x) => x.endsWith(".json"))) await check(`records/${f}`);
  }
  await check("workflows/index.json");
  return problems;
}

// ---------------------------------------------------------------- plan output

const short = (v) => {
  const s = JSON.stringify(v ?? null);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
};

export function formatPlan(plan) {
  const lines = [];
  const sign = { create: "+", update: "~", delete: "-" };
  for (const r of plan.records ?? []) {
    const who = r.op === "create" ? (r.ref ? `(new, ref ${r.ref})` : "(new)") : r.id;
    lines.push(`${sign[r.op] ?? "?"} ${r.resource} ${who}`);
    if (r.op !== "delete") for (const [k, d] of Object.entries(r.diff ?? {})) lines.push(`    ${k}: ${r.op === "create" ? short(d.to) : `${short(d.from)} → ${short(d.to)}`}`);
    for (const p of r.problems ?? []) lines.push(`    ! ${p}`);
  }
  for (const s of plan.settings ?? []) lines.push(`~ setting ${s.key}: ${short(s.from)} → ${short(s.to)}`);
  for (const w of plan.workflows ?? []) {
    const what = w.op === "update" ? [w.name_changed && "renamed", w.xml_changed && "diagram changed"].filter(Boolean).join(", ") : "";
    lines.push(`${sign[w.op] ?? "?"} workflow "${w.name}"${w.id ? ` ${w.id}` : ""}${what ? ` (${what})` : ""}`);
  }
  for (const p of plan.problems ?? []) lines.push(`! ${p}`);
  const s = plan.summary ?? {};
  lines.push("", `${s.create ?? 0} to create, ${s.update ?? 0} to update, ${s.delete ?? 0} to delete, ${s.settings ?? 0} setting(s), ${s.workflows ?? 0} workflow(s).`);
  if (!plan.ok) lines.push(`Not applicable: ${plan.problem_count ?? "some"} problem(s) above.`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- API

function connection() {
  const url = process.env.CHARMQUARK_URL?.replace(/\/+$/, "");
  const token = process.env.CHARMQUARK_TOKEN;
  if (!url || !token) throw new Error("set CHARMQUARK_URL and CHARMQUARK_TOKEN (Settings → API tokens)");
  return { url, token };
}

async function call(method, path, body) {
  const { url, token } = connection();
  const res = await fetch(`${url}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: res.status, data };
}

const detail = (r) => (r.data && typeof r.data === "object" && r.data.detail) || `HTTP ${r.status}`;

async function pull(dir) {
  const bundle = await call("GET", "/config/export");
  if (bundle.status !== 200) throw new Error(`export failed: ${detail(bundle)}`);
  if (bundle.data.format !== FORMAT) throw new Error(`the deployment speaks ${bundle.data.format}; this cq knows ${FORMAT}. Update cq.mjs.`);
  const list = await call("GET", "/config/schema");
  const schemas = {};
  for (const path of list.status === 200 ? list.data : []) {
    const s = await call("GET", `/config/schema/${path}`);
    if (s.status === 200) schemas[path] = s.data;
  }
  await writeBundle(dir, bundle.data, schemas);
  const counts = Object.entries(bundle.data.records ?? {}).map(([r, l]) => `${l.length} ${r}`).join(", ");
  console.log(`Pulled ${counts}, ${bundle.data.workflows?.length ?? 0} workflows and settings.`);
}

async function main(argv) {
  const [command, ...rest] = argv;
  const prune = rest.includes("--prune");
  const dir = process.cwd();

  if (command === "pull") {
    await pull(dir);
    return 0;
  }
  if (command === "validate" || command === "plan" || command === "apply") {
    const problems = await validateDir(dir);
    if (problems.length) {
      console.error(problems.map((p) => `✗ ${p}`).join("\n"));
      return 1;
    }
    if (command === "validate") {
      console.log("Files match the schemas.");
      return 0;
    }
  }
  if (command === "plan") {
    const r = await call("POST", "/config/plan", { bundle: await readBundle(dir), prune });
    if (r.status !== 200) throw new Error(`plan failed: ${detail(r)}`);
    console.log(formatPlan(r.data));
    await rm(join(dir, STATE), { force: true });
    if (!r.data.ok) return 1;
    await writeJson(join(dir, STATE), { digest: r.data.digest, prune });
    console.log(`\nPlan ${r.data.digest.slice(0, 12)} saved. Run "node cq.mjs apply${prune ? " --prune" : ""}" to apply exactly this.`);
    return 0;
  }
  if (command === "apply") {
    if (!existsSync(join(dir, STATE))) throw new Error('run "node cq.mjs plan" first and read the plan');
    const saved = await readJson(join(dir, STATE));
    if (saved.prune !== prune) throw new Error(`the plan was made ${saved.prune ? "with" : "without"} --prune; plan again`);
    const r = await call("POST", "/config/apply", { bundle: await readBundle(dir), prune, digest: saved.digest });
    if (r.status === 409) throw new Error(`${detail(r)}\nNothing was applied. Run plan again.`);
    if (r.status !== 200) {
      if (r.data?.problems || r.data?.records) console.error(formatPlan(r.data));
      throw new Error(`apply failed: ${detail(r)}`);
    }
    await rm(join(dir, STATE), { force: true });
    const s = r.data.summary;
    console.log(`${r.data.status}: ${s.create} created, ${s.update} updated, ${s.delete} deleted, ${s.settings} setting(s), ${s.workflows} workflow(s).`);
    for (const w of r.data.workflows ?? []) if (w.status >= 400) console.error(`✗ workflow "${w.name}": ${JSON.stringify(w.detail)}`);
    await pull(dir);
    console.log("Commit the files: they now carry the new ids and versions.");
    return r.data.status === "APPLIED" ? 0 : 1;
  }
  console.log("usage: node cq.mjs pull | validate | plan [--prune] | apply [--prune]");
  return command ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => { console.error(`✗ ${err.message}`); process.exitCode = 1; },
  );
}
