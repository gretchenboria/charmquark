"use client";

// Robot Operator "execute run" overlay. For each mission in the run it shows the mission
// code/name, a variant/error (T#V#E#) picker (selection, not typing), the mission's
// instructions rendered read-only, a Done toggle, and a free-text notes field. Every
// change is saved via PUT /runs/{id}/execution/{mission_id} (debounced on note typing,
// immediate on Done/variant). The field log can be printed or exported (CSV/JSON).
//
// Field-usability guarantees:
//  - Per-mission sync status (saved / saving / not saved) with one-tap retry.
//  - A localStorage draft mirrors the working log, so a reload/crash restores entries.
//  - Pending note saves are flushed on Close and on Finish (not only on blur).
//  - Done is gated on a chosen variant; Finish shows a recap of anything left open.
//  - Finish advances the run to COLLECTED; Close just leaves.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { api, ApiError } from "@/lib/api";
import type { ExecutionLog, ExecutionLogEntry, QARun, Run, MissionDetail } from "@/lib/types";
import { useToast } from "@/components/Toast";

// Field-check verdicts a robot operator can record per checklist item.
const CHECK_RESULTS = ["NOT_CHECKED", "PASS", "ACCEPTABLE", "FAIL", "SKIP", "NOT_APPLICABLE"];

// Per-mission save status for the sync chip.
type SyncStatus = "saving" | "saved" | "error";

const draftKey = (runId: string) => `charmquark:exec:${runId}`;

interface MissionInstr {
  format: string;
  content: string;
}

// Pretty-print JSON with 2-space indent; return the input unchanged if it does not parse.
const prettyJson = (raw: string): string => {
  const s = raw.trim();
  if (!s) return raw;
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return raw;
  }
};

const renderInstructions = (i: MissionInstr | null): string => {
  if (!i || !i.content.trim()) return "";
  return i.format === "json" ? prettyJson(i.content) : i.content;
};

// One mission's saved-log entry + its resolved detail/instructions.
interface Row {
  mission: MissionDetail;
  instr: MissionInstr | null;
}

function csvCell(v: string): string {
  // RFC-4180-style quoting: wrap in quotes and double embedded quotes when needed.
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function ExecuteRun({
  run,
  code,
  canEdit,
  onClose,
  onSaved,
}: {
  run: Run;
  code: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (s: Run) => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Working copy of the field log, keyed by mission_id. Seeded from the run, then a
  // localStorage draft (if any) is merged over it on mount so unsaved edits survive reload.
  const [log, setLog] = useState<ExecutionLog>(() => ({ ...(run.execution_log ?? {}) }));
  // Per-mission sync status.
  const [sync, setSync] = useState<Record<string, SyncStatus>>({});
  // Field checklist (QA field-log gates) for this run, and the mission whose full
  // instructions are open in the modal.
  const [qa, setQa] = useState<QARun | null>(null);
  const [instrModal, setInstrModal] = useState<Row | null>(null);
  // Instruction edit state (the modal doubles as an editor when canEdit).
  const [instrEditing, setInstrEditing] = useState(false);
  const [instrDraft, setInstrDraft] = useState("");
  const [instrSaving, setInstrSaving] = useState(false);
  // Finish recap panel + failed-check acknowledgement.
  const [finishing, setFinishing] = useState(false);
  const [ackFailed, setAckFailed] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);

  const openInstr = useCallback((r: Row) => {
    setInstrModal(r);
    setInstrEditing(false);
    setInstrDraft(r.instr?.content ?? "");
  }, []);

  const closeInstr = useCallback(() => {
    // Warn before discarding an unsaved edit.
    if (instrEditing && instrModal && instrDraft !== (instrModal.instr?.content ?? "")) {
      if (!window.confirm("Discard unsaved instruction edits?")) return;
    }
    setInstrModal(null);
    setInstrEditing(false);
  }, [instrEditing, instrModal, instrDraft]);

  const saveInstr = useCallback(async () => {
    if (!instrModal) return;
    setInstrSaving(true);
    try {
      const fmt = instrModal.instr?.format === "json" ? "json" : "txt";
      const saved = await api.saveInstructions(instrModal.mission.id, { content: instrDraft, format: fmt });
      const next: MissionInstr = { format: saved.format, content: saved.content };
      // reflect the edit in both the modal and the inline preview
      setRows((rs) => (rs ?? []).map((x) => (x.mission.id === instrModal.mission.id ? { ...x, instr: next } : x)));
      setInstrModal((mo) => (mo ? { ...mo, instr: next } : mo));
      setInstrEditing(false);
      toast("success", "Instructions saved");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not save instructions");
    } finally {
      setInstrSaving(false);
    }
  }, [instrModal, instrDraft, toast]);
  // Debounce timers for note saves, keyed by mission_id.
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Portal target is only available after mount (SSR-safe).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Merge any saved draft over the server-seeded log once on mount (draft holds unsaved edits).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey(run.id));
      if (raw) setLog((cur) => ({ ...cur, ...(JSON.parse(raw) as ExecutionLog) }));
    } catch {
      /* ignore malformed draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);

  // Persist the working log to localStorage on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(draftKey(run.id), JSON.stringify(log));
    } catch {
      /* storage full/unavailable — the in-memory log still holds */
    }
  }, [run.id, log]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // Resolve the missions to execute from the run's scope: an explicit mission_ids list
        // (SINGLE), or every mission in the chosen group (GROUP — mission_ids is empty there).
        let ids = run.mission_ids ?? [];
        if (run.mission_scope === "GROUP" && run.mission_group_id) {
          const all = await api.listMissions(run.campaign_id);
          ids = all.filter((t) => t.mission_group_id === run.mission_group_id).map((t) => t.id);
        }
        const details = await Promise.all(ids.map((tid) => api.getMission(tid)));
        const instr = await Promise.all(
          ids.map((tid) =>
            api
              .getInstructions(tid)
              .then((d) => ({ format: d.format, content: d.content }))
              .catch(() => null),
          ),
        );
        if (!live) return;
        setRows(details.map((mission, i) => ({ mission, instr: instr[i] })));
      } catch {
        if (live) setErr("Failed to load run missions.");
      }
    })();
    return () => {
      live = false;
    };
    // Only the mission_ids drive the load; the working log is seeded separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);

  // Clean up any pending debounce timers on unmount.
  useEffect(() => {
    const timers = noteTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  // Opening the field view begins execution: move a CONFIRMED run to IN_EXECUTION so
  // the record reflects that collection is underway. Runs once, only for an editor.
  const advancedOnce = useRef(false);
  useEffect(() => {
    if (advancedOnce.current || !canEdit || run.state !== "CONFIRMED") return;
    advancedOnce.current = true;
    api.advanceRun(run.id).then(onSaved).catch(() => {
      /* non-fatal: the robot operator can still record; state stays CONFIRMED */
    });
  }, [canEdit, run.state, run.id, onSaved]);

  // Load the run's field checklist (QA run) if one exists. Created on demand.
  useEffect(() => {
    let live = true;
    api.getQA(run.id)
      .then((r) => { if (live) setQa(r); })
      .catch(() => { if (live) setQa(null); });  // 404 -> not started yet
    return () => { live = false; };
  }, [run.id]);

  const startChecklist = useCallback(async () => {
    try {
      setQa(await api.createQA(run.id));
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not start the field checklist");
    }
  }, [run.id, toast]);

  const setCheck = useCallback(async (gateIndex: number, checkIndex: number, result: string) => {
    try {
      setQa(await api.updateQACheck(run.id, gateIndex, checkIndex, result));
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Update failed");
    }
  }, [run.id, toast]);

  // Only the FIELD-level gates belong in the robot operator's in-run checklist (LOCAL/CLOUD
  // gates are post-collection). Keep each gate's ORIGINAL index for the PATCH call.
  const fieldGates = useMemo(
    () => (qa?.gates ?? []).map((g, gi) => ({ g, gi })).filter((x) => x.g.level === "FIELD"),
    [qa],
  );

  const save = useCallback(
    async (missionId: string, body: { done?: boolean; note?: string; variant_code?: string | null }) => {
      setSync((m) => ({ ...m, [missionId]: "saving" }));
      try {
        const updated = await api.setMissionExecution(run.id, missionId, body);
        setLog({ ...(updated.execution_log ?? {}) });
        onSaved(updated);
        setSync((m) => ({ ...m, [missionId]: "saved" }));
      } catch (e) {
        // Keep the robot operator's local value; flag it unsaved so they can retry.
        toast("error", e instanceof ApiError ? e.friendly : "Save failed — tap Retry");
        setSync((m) => ({ ...m, [missionId]: "error" }));
      }
    },
    [run.id, onSaved, toast],
  );

  const setDone = (missionId: string, done: boolean) => {
    setLog((l) => ({ ...l, [missionId]: { ...l[missionId], done } }));
    save(missionId, { done });
  };

  const setVariant = (missionId: string, variant_code: string) => {
    const vc = variant_code || null;
    setLog((l) => ({ ...l, [missionId]: { ...l[missionId], variant_code: vc } }));
    save(missionId, { variant_code: vc });
  };

  // Note edits update local state immediately; the save is debounced so typing stays fluid.
  const onNoteChange = (missionId: string, note: string) => {
    setLog((l) => ({ ...l, [missionId]: { ...l[missionId], note } }));
    clearTimeout(noteTimers.current[missionId]);
    noteTimers.current[missionId] = setTimeout(() => save(missionId, { note }), 700);
  };

  // Explicit save on blur flushes any pending debounce immediately.
  const onNoteBlur = (missionId: string, note: string) => {
    clearTimeout(noteTimers.current[missionId]);
    save(missionId, { note });
  };

  // Retry re-sends the full current entry so the screen and server converge.
  const retry = (missionId: string) => {
    const e = log[missionId] ?? {};
    save(missionId, { done: e.done, note: e.note, variant_code: e.variant_code ?? null });
  };

  // Flush every pending note debounce, awaiting the saves. Called before Close/Finish.
  const flushNotes = useCallback(async () => {
    const pending = Object.keys(noteTimers.current);
    if (pending.length === 0) return;
    await Promise.all(
      pending.map((missionId) => {
        clearTimeout(noteTimers.current[missionId]);
        delete noteTimers.current[missionId];
        return save(missionId, { note: log[missionId]?.note ?? "" });
      }),
    );
  }, [log, save]);

  const doneCount = useMemo(
    () => (rows ?? []).filter((r) => log[r.mission.id]?.done).length,
    [rows, log],
  );

  const hasUnsaved = useMemo(() => Object.values(sync).some((s) => s === "error"), [sync]);

  const variantLabel = (r: Row): string => {
    const codeSel = log[r.mission.id]?.variant_code;
    if (!codeSel) return "";
    for (const v of r.mission.variant_options ?? []) {
      const e = v.errors.find((x) => x.code === codeSel);
      if (e) return `${codeSel} — ${v.name} · ${e.label}`;
    }
    return codeSel;
  };

  // What is still open, surfaced in the Finish recap.
  const recap = useMemo(() => {
    const list = rows ?? [];
    const notDone = list.filter((r) => !log[r.mission.id]?.done);
    const missingVariant = list.filter((r) => log[r.mission.id]?.done && !log[r.mission.id]?.variant_code);
    let checksOpen = 0;
    let checksFailed = 0;
    for (const { g } of fieldGates) {
      for (const c of g.check_items) {
        if (c.result === "NOT_CHECKED") checksOpen += 1;
        if (c.result === "FAIL") checksFailed += 1;
      }
    }
    return { notDone, missingVariant, checksOpen, checksFailed };
  }, [rows, log, fieldGates]);

  const jumpTo = (missionId: string) => {
    setFinishing(false);
    document.getElementById(`mission-${missionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const doClose = async () => {
    await flushNotes();
    onClose();
  };

  const doFinish = async () => {
    if (recap.checksFailed > 0 && !ackFailed) return;
    setFinishBusy(true);
    try {
      await flushNotes();
      if (hasUnsaved) {
        toast("error", "Some entries are not saved. Retry them before finishing.");
        return;
      }
      // Advance CONFIRMED/IN_EXECUTION down to COLLECTED (at most two steps).
      let s = run;
      for (let i = 0; i < 3 && (s.state === "CONFIRMED" || s.state === "IN_EXECUTION"); i += 1) {
        s = await api.advanceRun(s.id);
        onSaved(s);
        if (s.state === "COLLECTED") break;
      }
      if (typeof window !== "undefined") window.localStorage.removeItem(draftKey(run.id));
      toast("success", "Run finished");
      onClose();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not finish the run");
    } finally {
      setFinishBusy(false);
    }
  };

  const exportBlob = (filename: string, body: string, mime: string) => {
    const blob = new Blob([body], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const header = ["mission_code", "task_name", "variant_error", "done", "note", "updated_at"];
    const lines = [header.join(",")];
    for (const r of rows ?? []) {
      const e = log[r.mission.id] ?? {};
      lines.push(
        [
          r.mission.mission_code,
          r.mission.name,
          variantLabel(r),
          e.done ? "yes" : "no",
          e.note ?? "",
          e.updated_at ?? "",
        ]
          .map((c) => csvCell(String(c)))
          .join(","),
      );
    }
    // Field checklist section (gate/check/result) so the checklist exports with the log.
    if (qa) {
      lines.push("");
      lines.push(["checklist_gate", "check", "result"].join(","));
      for (const g of qa.gates) {
        for (const c of g.check_items) {
          lines.push([g.name, c.name, c.result].map((x) => csvCell(String(x))).join(","));
        }
      }
    }
    exportBlob(`${code}-field-log.csv`, lines.join("\n"), "text/csv");
  };

  const exportJson = () => {
    const payload = {
      session_code: code,
      missions: (rows ?? []).map((r) => ({
        mission_code: r.mission.mission_code,
        task_name: r.mission.name,
        variant_error: variantLabel(r),
        done: !!log[r.mission.id]?.done,
        note: log[r.mission.id]?.note ?? "",
        updated_at: log[r.mission.id]?.updated_at ?? null,
      })),
      checklist: qa
        ? qa.gates.map((g) => ({
            gate: g.name,
            level: g.level,
            status: g.status,
            checks: g.check_items.map((c) => ({ name: c.name, result: c.result })),
          }))
        : [],
    };
    exportBlob(`${code}-field-log.json`, JSON.stringify(payload, null, 2), "application/json");
  };

  const preCls =
    "max-h-64 overflow-auto whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-800";

  // Sync chip for a mission card.
  const SyncChip = ({ missionId, entry }: { missionId: string; entry: ExecutionLogEntry }) => {
    const st = sync[missionId];
    if (st === "saving") return <span className="text-xs text-neutral-400">saving…</span>;
    if (st === "error")
      return (
        <button
          onClick={() => retry(missionId)}
          className="rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Not saved · Retry
        </button>
      );
    if (st === "saved" || entry.updated_at) return <span className="text-xs text-green-600">saved</span>;
    return null;
  };

  if (!mounted) return null;

  return createPortal(
    <div className="execute-overlay fixed inset-0 z-40 flex flex-col bg-neutral-50 print:static print:z-auto">
      {/* toolbar — hidden on print */}
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3 print:hidden">
        <div>
          <h1 className="text-lg font-semibold">Execute run</h1>
          <p className="text-sm text-neutral-500">
            {code} · {doneCount}/{(rows ?? []).length} missions done
            {!canEdit && " · read-only"}
            {hasUnsaved && <span className="ml-2 text-red-600">· unsaved changes</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            Print
          </button>
          <button
            onClick={exportCsv}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            Export CSV
          </button>
          <button
            onClick={exportJson}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            Export JSON
          </button>
          <button
            onClick={doClose}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
      </header>

      {/* print-only header */}
      <div className="hidden px-6 pt-4 print:block">
        <h1 className="text-lg font-semibold">Run field log — {code}</h1>
      </div>

      <div className="flex-1 overflow-auto p-6 print:overflow-visible print:p-0">
        {err ? (
          <p className="text-sm text-red-600">{err}</p>
        ) : rows === null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-400">This run has no missions to execute.</p>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {/* Field checklist — the robot operator's per-run QA field log (sensor on,
                recording confirmed, ...). Reuses the QA field-log gates. */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] print:break-inside-avoid print:shadow-none">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-800">Field checklist</h2>
                {qa && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                    {qa.overall_status.replace(/_/g, " ").toLowerCase()}
                  </span>
                )}
              </div>
              {!qa ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-neutral-400">
                    Work through sensor/recording checks before and during the run.
                  </p>
                  <button
                    onClick={startChecklist}
                    disabled={!canEdit}
                    className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 print:hidden"
                  >
                    Start checklist
                  </button>
                </div>
              ) : fieldGates.length === 0 ? (
                <p className="text-sm text-neutral-400">No field checks for this campaign.</p>
              ) : (
                <div className="space-y-3">
                  {fieldGates.map(({ g, gi }) => (
                    <div key={gi}>
                      <div className="mb-1 text-xs font-medium text-neutral-700">{g.name}</div>
                      <ul className="space-y-1">
                        {g.check_items.map((c, ci) => (
                          <li key={ci} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate text-neutral-600">{c.name}</span>
                            {/* printed value (screen-hidden) so the checklist prints its results */}
                            <span className="hidden shrink-0 text-xs text-neutral-500 print:inline">
                              {c.result.replace(/_/g, " ").toLowerCase()}
                            </span>
                            {canEdit ? (
                              <select
                                value={c.result}
                                onChange={(ev) => setCheck(gi, ci, ev.target.value)}
                                className="shrink-0 rounded border border-neutral-300 px-1.5 py-0.5 text-xs print:hidden"
                              >
                                {CHECK_RESULTS.map((r) => (
                                  <option key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="shrink-0 text-xs text-neutral-500 print:hidden">{c.result.replace(/_/g, " ").toLowerCase()}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {rows.map((r) => {
              const e = log[r.mission.id] ?? {};
              const instructions = renderInstructions(r.instr);
              const saving = sync[r.mission.id] === "saving";
              const variantChosen = !!e.variant_code;
              return (
                <div
                  key={r.mission.id}
                  id={`mission-${r.mission.id}`}
                  className="scroll-mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] print:break-inside-avoid print:shadow-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-semibold text-neutral-800">{r.mission.mission_code}</span>
                      <span className="ml-2 text-neutral-600">{r.mission.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="print:hidden"><SyncChip missionId={r.mission.id} entry={e} /></span>
                      <label className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={!!e.done}
                          disabled={!canEdit || saving || (!e.done && !variantChosen)}
                          onChange={(ev) => setDone(r.mission.id, ev.target.checked)}
                          className="h-4 w-4"
                        />
                        Done
                      </label>
                    </div>
                  </div>

                  {/* variant / error being tested */}
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-neutral-400">Variant / error tested</label>
                    {canEdit ? (
                      <select
                        value={e.variant_code ?? ""}
                        disabled={saving}
                        onChange={(ev) => setVariant(r.mission.id, ev.target.value)}
                        className="cq-select w-full"
                      >
                        <option value="">— select —</option>
                        {(r.mission.variant_options ?? []).map((v) =>
                          v.errors.map((eo) => (
                            <option key={eo.code} value={eo.code}>
                              {eo.code} — {v.name} · {eo.label}
                              {eo.reps != null ? ` · ${eo.reps} reps` : ""}
                            </option>
                          )),
                        )}
                      </select>
                    ) : (
                      <p className="text-sm text-neutral-800">{variantLabel(r) || "—"}</p>
                    )}
                    {canEdit && !variantChosen && (
                      <p className="mt-1 text-xs text-neutral-400">Pick a variant to mark this mission done.</p>
                    )}
                  </div>

                  {/* instructions (read-only) */}
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs text-neutral-400">Instructions</label>
                      <button
                        onClick={() => openInstr(r)}
                        className="text-xs font-medium text-blue-700 hover:underline print:hidden"
                      >
                        {canEdit ? "View / edit instructions" : "View full instructions"}
                      </button>
                    </div>
                    {instructions ? (
                      <pre className={preCls}>{instructions}</pre>
                    ) : (
                      <p className="text-sm text-neutral-400">No instructions on file.</p>
                    )}
                  </div>

                  {/* free-text notes */}
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-neutral-400">Notes / comments</label>
                    {canEdit ? (
                      <textarea
                        value={e.note ?? ""}
                        onChange={(ev) => onNoteChange(r.mission.id, ev.target.value)}
                        onBlur={(ev) => onNoteBlur(r.mission.id, ev.target.value)}
                        placeholder="Record anything the robot operator observed…"
                        className="h-24 w-full rounded border border-neutral-300 p-2 text-sm text-neutral-800 print:h-auto print:border-neutral-200"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm text-neutral-800">{e.note || "—"}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Finish — the one action that ends the run. */}
            {canEdit && (
              <div className="flex justify-end pt-2 print:hidden">
                <button
                  onClick={() => { setAckFailed(false); setFinishing(true); }}
                  className="rounded-md bg-[color:var(--cq-iris)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[color:var(--cq-violet)]"
                >
                  Finish run
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Finish recap — confirm what is captured, flag what is still open. */}
      {finishing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
          onClick={() => setFinishing(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-neutral-800">Finish run {code}?</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {doneCount} of {(rows ?? []).length} missions done. Finishing moves the run to Collected.
            </p>

            <div className="mt-4 space-y-2 text-sm">
              {recap.notDone.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3">
                  <div className="font-medium text-amber-800">{recap.notDone.length} mission(s) not marked done</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {recap.notDone.map((r) => (
                      <button
                        key={r.mission.id}
                        onClick={() => jumpTo(r.mission.id)}
                        className="rounded border border-amber-300 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100"
                      >
                        {r.mission.mission_code}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {recap.missingVariant.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3 text-amber-800">
                  {recap.missingVariant.length} done mission(s) missing a variant.
                </div>
              )}
              {recap.checksOpen > 0 && (
                <div className="rounded-lg bg-amber-50 p-3 text-amber-800">
                  {recap.checksOpen} field check(s) still not checked.
                </div>
              )}
              {recap.checksFailed > 0 && (
                <div className="rounded-lg bg-red-50 p-3">
                  <div className="font-medium text-red-700">{recap.checksFailed} field check(s) failed.</div>
                  <label className="mt-2 flex items-center gap-2 text-xs text-red-700">
                    <input type="checkbox" checked={ackFailed} onChange={(ev) => setAckFailed(ev.target.checked)} className="h-4 w-4" />
                    Finish anyway — I have noted the failures.
                  </label>
                </div>
              )}
              {hasUnsaved && (
                <div className="rounded-lg bg-red-50 p-3 text-red-700">
                  Some entries are not saved. Retry them before finishing.
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setFinishing(false)}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Keep working
              </button>
              <button
                onClick={doFinish}
                disabled={finishBusy || hasUnsaved || (recap.checksFailed > 0 && !ackFailed)}
                className="rounded-md bg-[color:var(--cq-iris)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--cq-violet)] disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                {finishBusy ? "Finishing…" : "Finish run"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instruction modal — focused, readable view of one mission's full instructions. */}
      {instrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
          onClick={closeInstr}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-neutral-800">Instructions</div>
                <div className="truncate text-xs text-neutral-500">
                  {instrModal.mission.mission_code} · {instrModal.mission.name}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEdit && !instrEditing && (
                  <button
                    onClick={() => setInstrEditing(true)}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    Edit
                  </button>
                )}
                {canEdit && instrEditing && (
                  <button
                    onClick={saveInstr}
                    disabled={instrSaving}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {instrSaving ? "Saving…" : "Save"}
                  </button>
                )}
                <button
                  onClick={closeInstr}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-auto p-5">
              {instrEditing ? (
                <textarea
                  value={instrDraft}
                  onChange={(e) => setInstrDraft(e.target.value)}
                  placeholder="Write the mission instructions the robot operator should follow…"
                  className="h-[50vh] w-full rounded-lg border border-neutral-300 p-3 font-mono text-sm leading-relaxed text-neutral-800"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-800">
                  {renderInstructions(instrModal.instr) || "No instructions on file yet."}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
