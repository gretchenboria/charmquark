/**
 * Programs (campaigns), mission groups, missions, instructions, risk/legal review, and the
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

const MISSION_UPDATE_COLS = [
  "mission_group_id", "mission_code", "name", "group", "status", "review_status",
  "duration_type", "reps_target", "reps_actual", "schedule_status",
  "instructions_complete", "risk_level", "legal_approval",
  "variants", "inventory_item_ids", "instructions",
] as const;

const MISSION_TRANSFORM = {
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
  "mission_code", "name", "group", "duration_type", "reps_target", "reps_actual",
  "review_status", "risk_level", "legal_approval", "instructions_complete",
] as const;

export function mountCatalog(app: App): void {
  // ------------------------------------------------------------ campaigns
  app.get("/campaigns", async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM campaigns ORDER BY name`).all<Row>();
    return c.json(results.map(S.campaign));
  });

  app.get("/campaigns/:id", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM campaigns WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("campaign");
    return c.json(S.campaign(row));
  });

  app.post("/campaigns", async (c) => {
    const b = await c.req.json<Record<string, unknown>>();
    if (!b.name) throw badRequest("name is required");
    if (!b.campaign_type) throw badRequest("campaign_type is required");
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO campaigns (id, name, campaign_type, target_n, status) VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, b.name, b.campaign_type, b.target_n ?? 0, b.status ?? "DRAFT").run();
    const row = await c.env.DB.prepare(`SELECT * FROM campaigns WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.campaign(row!), 201);
  });

  app.patch("/campaigns/:id", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<Record<string, unknown>>();
    const upd = buildUpdate("campaigns", id, b, ["name", "status", "target_n", "campaign_type", "default_sensor_rig_id"]);
    if (upd) await c.env.DB.prepare(upd.sql).bind(...upd.params).run();
    const row = await c.env.DB.prepare(`SELECT * FROM campaigns WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("campaign");
    return c.json(S.campaign(row));
  });

  app.delete("/campaigns/:id", async (c) => {
    const res = await c.env.DB.prepare(`DELETE FROM campaigns WHERE id = ?`).bind(c.req.param("id")).run();
    if (!res.meta.changes) throw notFound("campaign");
    return c.body(null, 204);
  });

  // ------------------------------------------------------------ mission groups
  app.get("/campaigns/:id/mission-groups", async (c) => {
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM mission_groups WHERE campaign_id = ? ORDER BY "order", name`)
      .bind(c.req.param("id")).all<Row>();
    return c.json(results.map(S.missionGroup));
  });

  app.get("/mission-groups/:id", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM mission_groups WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("mission group");
    return c.json(S.missionGroup(row));
  });

  app.post("/mission-groups", async (c) => {
    const b = await c.req.json<Record<string, unknown>>();
    if (!b.campaign_id || !b.name) throw badRequest("campaign_id and name are required");
    const id = uuid();
    await c.env.DB.prepare(`INSERT INTO mission_groups (id, campaign_id, name, "order") VALUES (?, ?, ?, ?)`)
      .bind(id, b.campaign_id, b.name, b.order ?? 0).run();
    const row = await c.env.DB.prepare(`SELECT * FROM mission_groups WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.missionGroup(row!), 201);
  });

  // ------------------------------------------------------------ missions
  app.get("/campaigns/:id/missions", async (c) => {
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM missions WHERE campaign_id = ? ORDER BY mission_code`)
      .bind(c.req.param("id")).all<Row>();
    return c.json(results.map(S.mission));
  });

  app.get("/missions/:id", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM missions WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("mission");
    // Resolve this mission's inventory so the checklist can show the real gate.
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

  app.post("/missions", async (c) => {
    const b = await c.req.json<Record<string, unknown>>();
    if (!b.campaign_id || !b.mission_code || !b.name) throw badRequest("campaign_id, mission_code and name are required");
    const id = uuid();
    // Accept the same fields PATCH does, so a mission can be created ready-to-schedule
    // in one call rather than create-then-update.
    await c.env.DB.prepare(
      `INSERT INTO missions (id, campaign_id, mission_group_id, mission_code, name, "group", status,
                          duration_type, reps_target, reps_actual, schedule_status,
                          review_status, risk_level, legal_approval, instructions_complete,
                          variants, inventory_item_ids, instructions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, b.campaign_id, b.mission_group_id ?? null, b.mission_code, b.name, b.group ?? null,
      b.status ?? "NEW", b.duration_type ?? "UNSPECIFIED", b.reps_target ?? 1,
      b.reps_actual ?? 0, b.schedule_status ?? "AVAILABLE", b.review_status ?? "DRAFT",
      b.risk_level ?? "UNKNOWN", b.legal_approval ?? "NONE", fromBool(b.instructions_complete),
      jsonCol(b.variants ?? []), jsonCol(b.inventory_item_ids ?? []), jsonCol(b.instructions ?? []),
    ).run();
    const row = await c.env.DB.prepare(`SELECT * FROM missions WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.mission(row!), 201);
  });

  app.patch("/missions/:id", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<Record<string, unknown>>();
    const upd = buildUpdate("missions", id, b, MISSION_UPDATE_COLS, MISSION_TRANSFORM);
    if (upd) await c.env.DB.prepare(upd.sql).bind(...upd.params).run();
    const row = await c.env.DB.prepare(`SELECT * FROM missions WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("mission");
    return c.json(S.mission(row));
  });

  app.delete("/missions/:id", async (c) => {
    const res = await c.env.DB.prepare(`DELETE FROM missions WHERE id = ?`).bind(c.req.param("id")).run();
    if (!res.meta.changes) throw notFound("mission");
    return c.body(null, 204);
  });

  // ------------------------------------------------------------ risk / legal
  app.post("/missions/:id/assess-risk", async (c) => {
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(`SELECT * FROM missions WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("mission");
    const result = assessRisk({
      name: str(row, "name"),
      instructions: parseJson<unknown[]>(row["instructions"], []),
    });
    // Record the suggestion and route it to review; never auto-approve.
    const legal = result.needs_legal_review ? "PENDING" : "NONE";
    await c.env.DB
      .prepare(`UPDATE missions SET risk_level = ?, legal_approval = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(result.risk_level, legal, id).run();
    return c.json(result);
  });

  app.post("/missions/:id/legal-review", requireLegalReviewer, async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<{ approved?: boolean; note?: string }>();
    const verdict = b.approved ? "APPROVED" : "PENDING";
    const res = await c.env.DB
      .prepare(`UPDATE missions SET legal_approval = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(verdict, id).run();
    if (!res.meta.changes) throw notFound("mission");
    const row = await c.env.DB.prepare(`SELECT * FROM missions WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.mission(row!));
  });

  // ------------------------------------------------------------ instructions
  app.get("/missions/:id/instructions", async (c) => {
    const missionId = c.req.param("id");
    const row = await c.env.DB.prepare(`SELECT * FROM missions WHERE id = ?`).bind(missionId).first<Row>();
    if (!row) throw notFound("mission");
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM mission_instruction_versions WHERE mission_id = ? ORDER BY version_number DESC`)
      .bind(missionId).all<Row>();
    const steps = parseJson<unknown[]>(row["instructions"], []);
    const latest = results[0];
    return c.json({
      mission_id: missionId,
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

  app.put("/missions/:id/instructions", async (c) => {
    const missionId = c.req.param("id");
    const b = await c.req.json<{ content: string; format?: string; uploaded_by?: string; notes?: string }>();
    const mission = await c.env.DB.prepare(`SELECT id FROM missions WHERE id = ?`).bind(missionId).first<Row>();
    if (!mission) throw notFound("mission");

    // Store the content as the mission's instruction steps when it parses as JSON,
    // otherwise keep it as a single free-text step.
    let steps: unknown[];
    try {
      const parsed = JSON.parse(b.content);
      steps = Array.isArray(parsed) ? parsed : [{ step: 1, text: b.content }];
    } catch {
      steps = b.content.split("\n").filter(Boolean).map((text, i) => ({ step: i + 1, text }));
    }

    const prev = await c.env.DB
      .prepare(`SELECT MAX(version_number) AS v FROM mission_instruction_versions WHERE mission_id = ?`)
      .bind(missionId).first<Row>();
    const nextVersion = num(prev ?? {}, "v", 0) + 1;
    const versionId = uuid();
    const key = `instructions/${missionId}/v${nextVersion}.json`;

    await c.env.VAULT.put(key, JSON.stringify(steps, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO mission_instruction_versions (id, mission_id, version_number, file_path, uploaded_by, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(versionId, missionId, nextVersion, key, b.uploaded_by ?? null, b.notes ?? null),
      c.env.DB.prepare(
        `UPDATE missions SET instructions = ?, instructions_complete = 1, updated_at = datetime('now') WHERE id = ?`,
      ).bind(jsonCol(steps), missionId),
    ]);

    const { results } = await c.env.DB
      .prepare(`SELECT * FROM mission_instruction_versions WHERE mission_id = ? ORDER BY version_number DESC`)
      .bind(missionId).all<Row>();
    return c.json({
      mission_id: missionId,
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

  app.get("/missions/:id/instructions/versions/:versionId", async (c) => {
    const row = await c.env.DB
      .prepare(`SELECT * FROM mission_instruction_versions WHERE id = ? AND mission_id = ?`)
      .bind(c.req.param("versionId"), c.req.param("id")).first<Row>();
    if (!row) throw notFound("instruction version");
    const obj = await c.env.VAULT.get(str(row, "file_path"));
    return c.json({
      version_id: str(row, "id"),
      version_number: num(row, "version_number"),
      content: obj ? await obj.text() : "",
    });
  });

  app.delete("/missions/:id/instructions/versions/:versionId", async (c) => {
    const row = await c.env.DB
      .prepare(`SELECT * FROM mission_instruction_versions WHERE id = ? AND mission_id = ?`)
      .bind(c.req.param("versionId"), c.req.param("id")).first<Row>();
    if (!row) throw notFound("instruction version");
    await c.env.VAULT.delete(str(row, "file_path"));
    await c.env.DB.prepare(`DELETE FROM mission_instruction_versions WHERE id = ?`).bind(str(row, "id")).run();
    return c.body(null, 204);
  });

  // ------------------------------------------------------------ catalog CSV round-trip
  app.get("/campaigns/:id/catalog.csv", async (c) => {
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM missions WHERE campaign_id = ? ORDER BY mission_code`)
      .bind(c.req.param("id")).all<Row>();
    const lines = [CATALOG_COLUMNS.join(",")];
    for (const r of results) {
      lines.push(CATALOG_COLUMNS.map((col) => csvCell(r[col])).join(","));
    }
    return c.text(lines.join("\n"), 200, { "Content-Type": "text/csv; charset=utf-8" });
  });

  /** Diff an uploaded catalog CSV against the stored missions without writing anything. */
  app.post("/campaigns/:id/catalog/preview", async (c) => {
    const { csv_text } = await c.req.json<{ csv_text: string }>();
    const diff = await diffCatalog(c.env.DB, c.req.param("id"), csv_text);
    return c.json({ creates: diff.creates, updates: diff.updates, unchanged: diff.unchanged, errors: diff.errors });
  });

  /** Apply the same diff. Creates get generated codes when the CSV left the code blank. */
  app.post("/campaigns/:id/catalog/apply", async (c) => {
    const campaignId = c.req.param("id");
    const { csv_text } = await c.req.json<{ csv_text: string }>();
    const diff = await diffCatalog(c.env.DB, campaignId, csv_text);
    if (diff.errors.length) throw badRequest(diff.errors.join("; "));

    const stmts: D1PreparedStatement[] = [];
    let autoSeq = diff.maxCodeSeq;
    for (const row of diff.createRows) {
      const code = row.mission_code && row.mission_code !== "(auto)" ? row.mission_code : `T${++autoSeq}`;
      stmts.push(c.env.DB.prepare(
        `INSERT INTO missions (id, campaign_id, mission_code, name, "group", duration_type, reps_target,
                            reps_actual, review_status, risk_level, legal_approval, instructions_complete)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        uuid(), campaignId, code, row.name, row.group || null,
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
        .prepare(`UPDATE missions SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...vals, u.id));
    }
    if (stmts.length) await c.env.DB.batch(stmts);

    return c.json({ created: diff.createRows.length, updated: diff.updateRows.length, unchanged: diff.unchanged });
  });
}

// ---------------------------------------------------------------- catalog diff
interface CatalogDiffResult {
  creates: { mission_code: string; name: string; group: string }[];
  updates: { mission_code: string; changes: Record<string, { from: string; to: string }> }[];
  unchanged: number;
  errors: string[];
  createRows: Record<string, string>[];
  updateRows: { id: string; changes: Record<string, { from: string; to: string }> }[];
  maxCodeSeq: number;
}

/** Compare an uploaded CSV against the campaign's missions. Pure read — writes nothing. */
async function diffCatalog(db: D1Database, campaignId: string, csvText: string): Promise<CatalogDiffResult> {
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

  const { results } = await db.prepare(`SELECT * FROM missions WHERE campaign_id = ?`).bind(campaignId).all<Row>();
  const byCode = new Map(results.map((r) => [str(r, "mission_code"), r]));
  for (const code of byCode.keys()) {
    const m = /^T(\d+)$/.exec(code);
    if (m) out.maxCodeSeq = Math.max(out.maxCodeSeq, Number(m[1]));
  }

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    const rec: Record<string, string> = {};
    header.forEach((h, j) => { rec[h] = (cells[j] ?? "").trim(); });
    const code = rec["mission_code"] ?? "";
    if (!rec["name"]) {
      out.errors.push(`row ${i + 1}: name is required`);
      continue;
    }

    const existing = code ? byCode.get(code) : undefined;
    if (!existing) {
      out.creates.push({ mission_code: code || "(auto)", name: rec["name"]!, group: rec["group"] ?? "" });
      out.createRows.push(rec);
      continue;
    }

    const changes: Record<string, { from: string; to: string }> = {};
    for (const col of CATALOG_COLUMNS) {
      if (col === "mission_code" || !(col in rec)) continue;
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
      out.updates.push({ mission_code: code, changes });
      out.updateRows.push({ id: str(existing, "id"), changes });
    } else {
      out.unchanged += 1;
    }
  }
  return out;
}
