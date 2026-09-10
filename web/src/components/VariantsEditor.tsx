"use client";

// Variants & errors editor for a task. Each variant expands to execution codes T#V#E#
// (E0 = correct, E1.. = the planned errors). A rep target can be set per code (optional);
// the task's overall reps_target still stands as the aggregate goal. Saving writes the whole
// variants array back via updateTask; the same array feeds the Execute picker and auto-schedule.
import { useState } from "react";

import { api, ApiError } from "@/lib/api";
import type { TaskDetail } from "@/lib/types";
import { useToast } from "@/components/Toast";

interface EditError {
  id: string;
  label: string;
  reps: string; // kept as string for the input; "" = unset
}
interface EditVariant {
  id: string;
  name: string;
  correctReps: string; // reps for the E0 (correct) code; "" = unset
  errors: EditError[];
}

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

// task.variants (persisted JSON) -> editable rows.
function toEditable(task: TaskDetail): EditVariant[] {
  return (task.variants ?? []).map((v, vi) => {
    const raw = v as { id?: string; name?: string; correct?: { reps?: number }; errors?: { id?: string; label?: string; errorClass?: string | null; reps?: number }[] };
    return {
      id: raw.id ?? newId(),
      name: raw.name ?? `Variant ${vi + 1}`,
      correctReps: raw.correct?.reps != null ? String(raw.correct.reps) : "",
      errors: (raw.errors ?? []).map((e) => ({
        id: e.id ?? newId(),
        label: e.label ?? e.errorClass ?? "",
        reps: e.reps != null ? String(e.reps) : "",
      })),
    };
  });
}

// editable rows -> the variants JSON shape the backend + variant_options builder expect.
function toVariants(rows: EditVariant[]) {
  const repOrNothing = (s: string) => (s.trim() === "" ? {} : { reps: Math.max(0, Math.floor(Number(s) || 0)) });
  return rows.map((v, vi) => ({
    id: v.id,
    name: v.name.trim() || `Variant ${vi + 1}`,
    correct: { id: `${v.id}-c`, ...repOrNothing(v.correctReps) },
    errors: v.errors.map((e, ei) => ({ id: e.id, label: e.label.trim() || `Error ${ei + 1}`, ...repOrNothing(e.reps) })),
  }));
}

export function VariantsEditor({ task, canEdit, onSaved }: { task: TaskDetail; canEdit: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<EditVariant[]>(() => toEditable(task));
  const [saving, setSaving] = useState(false);

  const begin = () => {
    setRows(toEditable(task));
    setEditing(true);
  };
  const cancel = () => setEditing(false);

  const addVariant = () => setRows((r) => [...r, { id: newId(), name: `Variant ${r.length + 1}`, correctReps: "", errors: [] }]);
  const removeVariant = (vi: number) => setRows((r) => r.filter((_, i) => i !== vi));
  const setVariant = (vi: number, patch: Partial<EditVariant>) =>
    setRows((r) => r.map((v, i) => (i === vi ? { ...v, ...patch } : v)));

  const addError = (vi: number) =>
    setRows((r) => r.map((v, i) => (i === vi ? { ...v, errors: [...v.errors, { id: newId(), label: "", reps: "" }] } : v)));
  const removeError = (vi: number, ei: number) =>
    setRows((r) => r.map((v, i) => (i === vi ? { ...v, errors: v.errors.filter((_, j) => j !== ei) } : v)));
  const setError = (vi: number, ei: number, patch: Partial<EditError>) =>
    setRows((r) => r.map((v, i) => (i === vi ? { ...v, errors: v.errors.map((e, j) => (j === ei ? { ...e, ...patch } : e)) } : v)));

  const save = async () => {
    setSaving(true);
    try {
      await api.updateTask(task.id, { variants: toVariants(rows) });
      toast("success", "Variants saved");
      setEditing(false);
      onSaved();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "rounded border border-neutral-300 px-2 py-1 text-sm";

  // ---- read-only view ----
  if (!editing) {
    const opts = task.variant_options ?? [];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-500">
            {opts.length === 0
              ? "No variants defined — the Execute picker will be empty."
              : `${opts.length} variant(s) · ${opts.reduce((n, v) => n + v.errors.length, 0)} execution code(s)`}
          </p>
          {canEdit && (
            <button onClick={begin} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              Edit variants
            </button>
          )}
        </div>
        {opts.length === 0 ? (
          <p className="text-sm text-neutral-400">No variants defined.</p>
        ) : (
          <ul className="space-y-2">
            {opts.map((v) => (
              <li key={v.variant_number} className="rounded border border-neutral-200 bg-white p-3 text-sm">
                <div className="font-medium">{v.name}</div>
                <ul className="mt-1 space-y-0.5">
                  {v.errors.map((e) => (
                    <li key={e.code} className="flex items-center gap-2 text-xs text-neutral-600">
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700">{e.code}</span>
                      <span>{e.label}</span>
                      {e.reps != null && <span className="text-neutral-400">· {e.reps} reps</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ---- edit view ----
  return (
    <div className="space-y-4">
      {rows.map((v, vi) => (
        <div key={v.id} className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <input
              className={`${inputCls} flex-1`}
              value={v.name}
              placeholder={`Variant ${vi + 1}`}
              onChange={(e) => setVariant(vi, { name: e.target.value })}
            />
            <button onClick={() => removeVariant(vi)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">
              Remove variant
            </button>
          </div>

          {/* E0 correct + its optional reps */}
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700">
              {task.task_code}V{vi + 1}E0
            </span>
            <span className="text-neutral-600">Correct (no error)</span>
            <input
              type="number"
              min={0}
              className={`${inputCls} ml-auto w-24`}
              value={v.correctReps}
              placeholder="reps"
              onChange={(e) => setVariant(vi, { correctReps: e.target.value })}
            />
          </div>

          {/* errors E1.. */}
          <div className="mt-2 space-y-2">
            {v.errors.map((er, ei) => (
              <div key={er.id} className="flex items-center gap-2">
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700">
                  {task.task_code}V{vi + 1}E{ei + 1}
                </span>
                <input
                  className={`${inputCls} flex-1`}
                  value={er.label}
                  placeholder={`Error ${ei + 1} label`}
                  onChange={(e) => setError(vi, ei, { label: e.target.value })}
                />
                <input
                  type="number"
                  min={0}
                  className={`${inputCls} w-24`}
                  value={er.reps}
                  placeholder="reps"
                  onChange={(e) => setError(vi, ei, { reps: e.target.value })}
                />
                <button onClick={() => removeError(vi, ei)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                  Remove
                </button>
              </div>
            ))}
            <button onClick={() => addError(vi)} className="text-xs font-medium text-blue-700 hover:underline">
              + Add error
            </button>
          </div>
        </div>
      ))}

      <button onClick={addVariant} className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50">
        + Add variant
      </button>

      <div className="flex items-center gap-2 border-t border-neutral-200 pt-3">
        <button onClick={save} disabled={saving} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save variants"}
        </button>
        <button onClick={cancel} className="rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50">
          Cancel
        </button>
        <span className="ml-auto text-xs text-neutral-400">Reps here are optional per-code targets; the task Reps target is the overall goal.</span>
      </div>
    </div>
  );
}
