/**
 * Programs (studies), task groups, tasks, instructions, risk/legal review, and the
 * catalog CSV round-trip (export -> edit in a spreadsheet -> preview -> apply).
 */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { buildUpdate, fromBool, jsonCol, num, parseJson, str, uuid, type Row } from "../db";
import { badRequest, notFound } from "../errors";
import { requireLegalReviewer } from "../auth";
import { assessRisk, taskChecklist } from "../domain";
import * as S from "../serialize";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

const TASK_UPDATE_COLS = [
  "task_group_id", "task_code", "name", "group", "status", "review_status",
  "duration_type", "reps_target", "reps_actual", "schedule_status",
  "instructions_complete", "risk_level", "legal_approval",
  "variants", "inventory_item_ids", "instructions",
] as const;

const TASK_TRANSFORM = {
  instructions_complete: (v: unknown) => fromBool(v),
  variants: (v: unknown) => jsonCol(v ?? []),
  inventory_item_ids: (v: unknown) => jsonCol(v ?? []),
  instructions: (v: unknown) => jsonCol(v ?? []),
};

// ---------------------------------------------------------------- CSV helpers
/** Minimal RFC4180-ish parser: handles quoted fields, embedded commas and "" escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const csvCell = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const CATALOG_COLUMNS = [
  "task_code", "name", "group", "duration_type", "reps_target", "reps_actual",
  "review_status", "risk_level", "legal_approval", "instructions_complete",
] as const;

export function mountCatalog(app: App): void {
  // ------------------------------------------------------------ studies
  app.get("/studies", async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM studies ORDER BY name`).all<Row>();
    return c.json(results.map(S.study));
  });

  app.get("/studies/:id", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM studies WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("study");
    return c.json(S.study(row));
  });

  app.post("/studies", async (c) => {
    const b = await c.req.json<Record<string, unknown>>();
    if (!b.name) throw badRequest("name is required");
    if (!b.study_type) throw badRequest("study_type is required");
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO studies (id, name, study_type, target_n, status) VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, b.name, b.study_type, b.target_n ?? 0, b.status ?? "DRAFT").run();
    const row = await c.env.DB.prepare(`SELECT * FROM studies WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.study(row!), 201);
  });

  app.patch("/studies/:id", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<Record<string, unknown>>();
    const upd = buildUpdate("studies", id, b, ["name", "status", "target_n", "study_type", "default_device_fleet_id"]);
    if (upd) await c.env.DB.prepare(upd.sql).bind(...upd.params).run();
    const row = await c.env.DB.prepare(`SELECT * FROM studies WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("study");
    return c.json(S.study(row));
  });

  app.delete("/studies/:id", async (c) => {
    const res = await c.env.DB.prepare(`DELETE FROM studies WHERE id = ?`).bind(c.req.param("id")).run();
    if (!res.meta.changes) throw notFound("study");
    return c.body(null, 204);
  });

  // ------------------------------------------------------------ task groups
  app.get("/studies/:id/task-groups", async (c) => {
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM task_groups WHERE study_id = ? ORDER BY "order", name`)
      .bind(c.req.param("id")).all<Row>();
    return c.json(results.map(S.taskGroup));
  });

  app.get("/task-groups/:id", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM task_groups WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("task group");
    return c.json(S.taskGroup(row));
  });

  app.post("/task-groups", async (c) => {
    const b = await c.req.json<Record<string, unknown>>();
    if (!b.study_id || !b.name) throw badRequest("study_id and name are required");
    const id = uuid();
    await c.env.DB.prepare(`INSERT INTO task_groups (id, study_id, name, "order") VALUES (?, ?, ?, ?)`)
      .bind(id, b.study_id, b.name, b.order ?? 0).run();
    const row = await c.env.DB.prepare(`SELECT * FROM task_groups WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.taskGroup(row!), 201);
  });

  // ------------------------------------------------------------ tasks
  app.get("/studies/:id/tasks", async (c) => {
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM tasks WHERE study_id = ? ORDER BY task_code`)
      .bind(c.req.param("id")).all<Row>();
    return c.json(results.map(S.task));
  });

  app.get("/tasks/:id", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("task");
    // Resolve this task's inventory so the checklist can show the real gate.
    const ids = parseJson<string[]>(row["inventory_item_ids"], []);
    let inv: { name: string; status: string }[] | null = null;
    if (ids.length) {
      const { results } = await c.env.DB
        .prepare(`SELECT name, status FROM inventory_items WHERE id IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids).all<Row>();
      inv = results.map((r) => ({ name: str(r, "name"), status: str(r, "status") }));
    }
    const detail = S.taskDetail(row);
    return c.json({ ...detail, checklist: taskChecklist(S.taskLike(row), inv) });
  });

  app.post("/tasks", async (c) => {
    const b = await c.req.json<Record<string, unknown>>();
    if (!b.study_id || !b.task_code || !b.name) throw badRequest("study_id, task_code and name are required");
    const id = uuid();
    // Accept the same fields PATCH does, so a task can be created ready-to-schedule
    // in one call rather than create-then-update.
    await c.env.DB.prepare(
      `INSERT INTO tasks (id, study_id, task_group_id, task_code, name, "group", status,
                          duration_type, reps_target, reps_actual, schedule_status,
                          review_status, risk_level, legal_approval, instructions_complete,
                          variants, inventory_item_ids, instructions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, b.study_id, b.task_group_id ?? null, b.task_code, b.name, b.group ?? null,
      b.status ?? "NEW", b.duration_type ?? "UNSPECIFIED", b.reps_target ?? 1,
      b.reps_actual ?? 0, b.schedule_status ?? "AVAILABLE", b.review_status ?? "DRAFT",
      b.risk_level ?? "UNKNOWN", b.legal_approval ?? "NONE", fromBool(b.instructions_complete),
      jsonCol(b.variants ?? []), jsonCol(b.inventory_item_ids ?? []), jsonCol(b.instructions ?? []),
    ).run();
    const row = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.task(row!), 201);
  });

  app.patch("/tasks/:id", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<Record<string, unknown>>();
    const upd = buildUpdate("tasks", id, b, TASK_UPDATE_COLS, TASK_TRANSFORM);
    if (upd) await c.env.DB.prepare(upd.sql).bind(...upd.params).run();
    const row = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("task");
    return c.json(S.task(row));
  });

  app.delete("/tasks/:id", async (c) => {
    const res = await c.env.DB.prepare(`DELETE FROM tasks WHERE id = ?`).bind(c.req.param("id")).run();
    if (!res.meta.changes) throw notFound("task");
    return c.body(null, 204);
  });

  // ------------------------------------------------------------ risk / legal
  app.post("/tasks/:id/assess-risk", async (c) => {
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("task");
    const result = assessRisk({
      name: str(row, "name"),
      instructions: parseJson<unknown[]>(row["instructions"], []),
    });
    // Record the suggestion and route it to review; never auto-approve.
    const legal = result.needs_legal_review ? "PENDING" : "NONE";
    await c.env.DB
      .prepare(`UPDATE tasks SET risk_level = ?, legal_approval = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(result.risk_level, legal, id).run();
    return c.json(result);
  });

  app.post("/tasks/:id/legal-review", requireLegalReviewer, async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<{ approved?: boolean; note?: string }>();
    const verdict = b.approved ? "APPROVED" : "PENDING";
    const res = await c.env.DB
      .prepare(`UPDATE tasks SET legal_approval = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(verdict, id).run();
    if (!res.meta.changes) throw notFound("task");
    const row = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.task(row!));
  });

  // ------------------------------------------------------------ instructions
  app.get("/tasks/:id/instructions", async (c) => {
    const taskId = c.req.param("id");
    const row = await c.env.DB.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(taskId).first<Row>();
    if (!row) throw notFound("task");
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM task_instruction_versions WHERE task_id = ? ORDER BY version_number DESC`)
      .bind(taskId).all<Row>();
    const steps = parseJson<unknown[]>(row["instructions"], []);
    const latest = results[0];
    return c.json({
      task_id: taskId,
      format: "json",
      current_version: latest ? num(latest, "version_number") : null,
      content: JSON.stringify(steps, null, 2),
      versions: results.map((v) => ({
        version_id: str(v, "id"),
        version_number: num(v, "version_number"),
        uploaded_by: v["uploaded_by"] ?? null,
        notes: v["notes"] ?? null,
        created_at: str(v, "created_at"),
      })),
    });
  });

  app.put("/tasks/:id/instructions", async (c) => {
    const taskId = c.req.param("id");
    const b = await c.req.json<{ content: string; format?: string; uploaded_by?: string; notes?: string }>();
    const task = await c.env.DB.prepare(`SELECT id FROM tasks WHERE id = ?`).bind(taskId).first<Row>();
    if (!task) throw notFound("task");

    // Store the content as the task's instruction steps when it parses as JSON,
    // otherwise keep it as a single free-text step.
    let steps: unknown[];
    try {
      const parsed = JSON.parse(b.content);
      steps = Array.isArray(parsed) ? parsed : [{ step: 1, text: b.content }];
    } catch {
      steps = b.content.split("\n").filter(Boolean).map((text, i) => ({ step: i + 1, text }));
    }

    const prev = await c.env.DB
      .prepare(`SELECT MAX(version_number) AS v FROM task_instruction_versions WHERE task_id = ?`)
      .bind(taskId).first<Row>();
    const nextVersion = num(prev ?? {}, "v", 0) + 1;
    const versionId = uuid();
    const key = `instructions/${taskId}/v${nextVersion}.json`;

    await c.env.VAULT.put(key, JSON.stringify(steps, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO task_instruction_versions (id, task_id, version_number, file_path, uploaded_by, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(versionId, taskId, nextVersion, key, b.uploaded_by ?? null, b.notes ?? null),
      c.env.DB.prepare(
        `UPDATE tasks SET instructions = ?, instructions_complete = 1, updated_at = datetime('now') WHERE id = ?`,
      ).bind(jsonCol(steps), taskId),
    ]);

    const { results } = await c.env.DB
      .prepare(`SELECT * FROM task_instruction_versions WHERE task_id = ? ORDER BY version_number DESC`)
      .bind(taskId).all<Row>();
    return c.json({
      task_id: taskId,
      format: b.format ?? "json",
      current_version: nextVersion,
      content: JSON.stringify(steps, null, 2),
      versions: results.map((v) => ({
        version_id: str(v, "id"),
        version_number: num(v, "version_number"),
        uploaded_by: v["uploaded_by"] ?? null,
        notes: v["notes"] ?? null,
        created_at: str(v, "created_at"),
      })),
    });
  });

  app.get("/tasks/:id/instructions/versions/:versionId", async (c) => {
    const row = await c.env.DB
      .prepare(`SELECT * FROM task_instruction_versions WHERE id = ? AND task_id = ?`)
      .bind(c.req.param("versionId"), c.req.param("id")).first<Row>();
    if (!row) throw notFound("instruction version");
    const obj = await c.env.VAULT.get(str(row, "file_path"));
    return c.json({
      version_id: str(row, "id"),
      version_number: num(row, "version_number"),
      content: obj ? await obj.text() : "",
    });
  });

  app.delete("/tasks/:id/instructions/versions/:versionId", async (c) => {
    const row = await c.env.DB
      .prepare(`SELECT * FROM task_instruction_versions WHERE id = ? AND task_id = ?`)
      .bind(c.req.param("versionId"), c.req.param("id")).first<Row>();
    if (!row) throw notFound("instruction version");
    await c.env.VAULT.delete(str(row, "file_path"));
    await c.env.DB.prepare(`DELETE FROM task_instruction_versions WHERE id = ?`).bind(str(row, "id")).run();
    return c.body(null, 204);
  });

  // ------------------------------------------------------------ catalog CSV round-trip
  app.get("/studies/:id/catalog.csv", async (c) => {
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM tasks WHERE study_id = ? ORDER BY task_code`)
      .bind(c.req.param("id")).all<Row>();
    const lines = [CATALOG_COLUMNS.join(",")];
    for (const r of results) {
      lines.push(CATALOG_COLUMNS.map((col) => csvCell(r[col])).join(","));
    }
    return c.text(lines.join("\n"), 200, { "Content-Type": "text/csv; charset=utf-8" });
  });

  /** Diff an uploaded catalog CSV against the stored tasks without writing anything. */
  app.post("/studies/:id/catalog/preview", async (c) => {
    const { csv_text } = await c.req.json<{ csv_text: string }>();
    const diff = await diffCatalog(c.env.DB, c.req.param("id"), csv_text);
    return c.json({ creates: diff.creates, updates: diff.updates, unchanged: diff.unchanged, errors: diff.errors });
  });

  /** Apply the same diff. Creates get generated codes when the CSV left the code blank. */
  app.post("/studies/:id/catalog/apply", async (c) => {
    const studyId = c.req.param("id");
    const { csv_text } = await c.req.json<{ csv_text: string }>();
    const diff = await diffCatalog(c.env.DB, studyId, csv_text);
    if (diff.errors.length) throw badRequest(diff.errors.join("; "));

    const stmts: D1PreparedStatement[] = [];
    let autoSeq = diff.maxCodeSeq;
    for (const row of diff.createRows) {
      const code = row.task_code && row.task_code !== "(auto)" ? row.task_code : `T${++autoSeq}`;
      stmts.push(c.env.DB.prepare(
        `INSERT INTO tasks (id, study_id, task_code, name, "group", duration_type, reps_target,
                            reps_actual, review_status, risk_level, legal_approval, instructions_complete)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        uuid(), studyId, code, row.name, row.group || null,
        row.duration_type || "UNSPECIFIED", Number(row.reps_target || 1), Number(row.reps_actual || 0),
        row.review_status || "DRAFT", row.risk_level || "UNKNOWN", row.legal_approval || "NONE",
        fromBool(row.instructions_complete),
      ));
    }
    for (const u of diff.updateRows) {
      const cols = Object.keys(u.changes);
      const sets = cols.map((col) => `"${col}" = ?`).join(", ");
      const vals = cols.map((col) =>
        col === "instructions_complete" ? fromBool(u.changes[col]!.to) : u.changes[col]!.to,
      );
      stmts.push(c.env.DB
        .prepare(`UPDATE tasks SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...vals, u.id));
    }
    if (stmts.length) await c.env.DB.batch(stmts);

    return c.json({ created: diff.createRows.length, updated: diff.updateRows.length, unchanged: diff.unchanged });
  });
}

// ---------------------------------------------------------------- catalog diff
interface CatalogDiffResult {
  creates: { task_code: string; name: string; group: string }[];
  updates: { task_code: string; changes: Record<string, { from: string; to: string }> }[];
  unchanged: number;
  errors: string[];
  createRows: Record<string, string>[];
  updateRows: { id: string; changes: Record<string, { from: string; to: string }> }[];
  maxCodeSeq: number;
}

/** Compare an uploaded CSV against the study's tasks. Pure read — writes nothing. */
async function diffCatalog(db: D1Database, studyId: string, csvText: string): Promise<CatalogDiffResult> {
  const out: CatalogDiffResult = {
    creates: [], updates: [], unchanged: 0, errors: [], createRows: [], updateRows: [], maxCodeSeq: 0,
  };
  const rows = parseCsv(csvText ?? "");
  if (rows.length === 0) {
    out.errors.push("CSV is empty");
    return out;
  }
  const header = rows[0]!.map((h) => h.trim());
  const nameIdx = header.indexOf("name");
  if (nameIdx === -1) {
    out.errors.push("CSV must have a 'name' column");
    return out;
  }

  const { results } = await db.prepare(`SELECT * FROM tasks WHERE study_id = ?`).bind(studyId).all<Row>();
  const byCode = new Map(results.map((r) => [str(r, "task_code"), r]));
  for (const code of byCode.keys()) {
    const m = /^T(\d+)$/.exec(code);
    if (m) out.maxCodeSeq = Math.max(out.maxCodeSeq, Number(m[1]));
  }

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    const rec: Record<string, string> = {};
    header.forEach((h, j) => { rec[h] = (cells[j] ?? "").trim(); });
    const code = rec["task_code"] ?? "";
    if (!rec["name"]) {
      out.errors.push(`row ${i + 1}: name is required`);
      continue;
    }

    const existing = code ? byCode.get(code) : undefined;
    if (!existing) {
      out.creates.push({ task_code: code || "(auto)", name: rec["name"]!, group: rec["group"] ?? "" });
      out.createRows.push(rec);
      continue;
    }

    const changes: Record<string, { from: string; to: string }> = {};
    for (const col of CATALOG_COLUMNS) {
      if (col === "task_code" || !(col in rec)) continue;
      const before = String(existing[col] ?? "");
      const after = rec[col] ?? "";
      // instructions_complete round-trips as 0/1; compare normalized truthiness.
      if (col === "instructions_complete") {
        if (String(fromBool(after === "1" || after.toLowerCase() === "true")) !== before) {
          changes[col] = { from: before, to: after };
        }
        continue;
      }
      if (after !== before) changes[col] = { from: before, to: after };
    }
    if (Object.keys(changes).length) {
      out.updates.push({ task_code: code, changes });
      out.updateRows.push({ id: str(existing, "id"), changes });
    } else {
      out.unchanged += 1;
    }
  }
  return out;
}
