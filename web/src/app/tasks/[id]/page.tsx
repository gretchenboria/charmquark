"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api, ApiError } from "@/lib/api";
import { canDelete, canUpdate, canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { ChecklistItem, InventoryItem, Study, TaskDetail, TaskGroup } from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { DeleteButton } from "@/components/DeleteButton";
import { ReadinessChecklist } from "@/components/ReadinessChecklist";
import { RiskLegalPanel } from "@/components/RiskLegalPanel";
import { TaskInstructionsPanel } from "@/components/TaskInstructionsPanel";
import { VariantsEditor } from "@/components/VariantsEditor";
import { useToast } from "@/components/Toast";
import { validateField } from "@/lib/validation";

const DURATIONS = ["SHORT", "MEDIUM", "LONG", "UNSPECIFIED"] as const;

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const toast = useToast();
  const canEdit = canWriteCatalog(user?.role);
  const canEditInstructions = canUpdate(user?.role);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [study, setStudy] = useState<Study | null>(null);
  const [group, setGroup] = useState<TaskGroup | null>(null);
  const [inv, setInv] = useState<InventoryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    duration_type: "UNSPECIFIED",
    reps_target: 1,
  });

  const load = useCallback(() => {
    if (!id) return;
    api
      .getTask(id)
      .then(async (t) => {
        setTask(t);
        setForm({
          name: t.name,
          duration_type: t.duration_type,
          reps_target: t.reps_target,
        });
        const [s, invAll] = await Promise.all([
          api.getStudy(t.study_id),
          api.listInventoryItems(t.study_id),
        ]);
        setStudy(s);
        setInv(invAll.filter((i) => t.inventory_item_ids.includes(i.id)));
        if (t.task_group_id) setGroup(await api.getTaskGroup(t.task_group_id));
      })
      .catch(() => setErr("Failed to load task."));
  }, [id]);
  useEffect(load, [load]);

  const formError =
    validateField(form.name, { required: true, label: "Name" }) ??
    validateField(form.reps_target, { numeric: true, required: true, min: 0, label: "Repetitions target" });

  const save = async () => {
    if (!task) return;
    if (formError) return;
    setSaving(true);
    try {
      await api.updateTask(task.id, {
        name: form.name.trim(),
        duration_type: form.duration_type,
        reps_target: Number(form.reps_target),
      });
      toast("success", "Task saved");
      setEditing(false);
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!task) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  const invReady = inv.length === 0 || inv.every((i) => i.status === "AVAILABLE" || i.status === "PROCURED");
  const checklist: ChecklistItem[] = [
    { key: "instructions_complete", label: "Instructions complete", done: task.instructions_complete, source: "manual" },
    { key: "variants", label: "Variants defined", done: task.variants.length > 0, source: "auto" },
    { key: "risk_cleared", label: "Risk cleared (low or legal-approved)", done: task.risk_level === "LOW" || task.legal_approval === "APPROVED", source: "auto" },
    { key: "inventory_ready", label: "All tools/parts/consumables ready", done: invReady, source: "auto" },
    { key: "ready", label: "Ready to schedule", done: task.is_ready, source: "auto" },
  ];

  const labelCls = "mb-1 block text-xs font-medium text-neutral-500";
  const inputCls = "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

  return (
    <DetailPage
      title={`${task.task_code} · ${task.name}`}
      subtitle={task.is_ready ? "Ready to schedule" : "Not ready"}
      backHref="/tasks"
      backLabel="Tasks"
      actions={
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Edit task
            </button>
          )}
          <DeleteButton
            hidden={!canDelete(user?.role)}
            label="Delete task"
            confirm={`Delete task ${task.task_code}?`}
            onDelete={() => api.deleteTask(task.id)}
            backHref="/tasks"
          />
        </div>
      }
      fields={[
        {
          label: "Study",
          value: study ? (
            <a href={`/studies/${study.id}`} className="text-blue-700 hover:underline">
              {study.name}
            </a>
          ) : (
            "—"
          ),
        },
        { label: "Task Group", value: group?.name ?? "—" },
        { label: "Risk", value: task.risk_level },
        { label: "Legal", value: task.legal_approval },
        { label: "Size", value: task.duration_type },
        { label: "Reps", value: `${task.reps_actual}/${task.reps_target}` },
        { label: "Instructions", value: task.instructions_complete ? "Complete" : "Incomplete" },
        { label: "Ready", value: task.is_ready ? "Yes" : "No" },
      ]}
    >
      {editing && (
        <Section title="Edit task">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={labelCls}>Code</span>
              <div className={`${inputCls} bg-neutral-50 text-neutral-500`}>{task.task_code}</div>
            </label>
            <label>
              <span className={labelCls}>Name</span>
              <input className={inputCls} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              <span className={labelCls}>Size (effort)</span>
              <select className={inputCls} value={form.duration_type}
                onChange={(e) => setForm({ ...form, duration_type: e.target.value })}>
                {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>
              <span className={labelCls}>Repetitions target</span>
              <input type="number" min={0} className={inputCls} value={form.reps_target}
                onChange={(e) => setForm({ ...form, reps_target: Number(e.target.value) })} />
            </label>
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Instructions complete is set automatically once instructions exist (see the Instructions section below).
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={save} disabled={saving || !!formError}
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setEditing(false); load(); }}
              className="rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50">
              Cancel
            </button>
            {formError && <span className="text-xs text-red-600">{formError}</span>}
          </div>
        </Section>
      )}
      <Section title="Readiness">
        <ReadinessChecklist items={checklist} canEdit={false} />
      </Section>
      <Section title="Risk & Legal">
        <RiskLegalPanel task={task} role={user?.role} onChanged={load} />
      </Section>
      <Section title="Instructions">
        <TaskInstructionsPanel taskId={task.id} canEdit={canEditInstructions} />
      </Section>
      <Section title={`Variants & errors (${task.variants.length})`}>
        <VariantsEditor task={task} canEdit={canEdit} onSaved={load} />
      </Section>
      <Section title={`Required Inventory (${inv.length})`}>
        <LinkList
          items={inv.map((i) => ({ href: `/inventory/${i.id}`, label: i.name, note: i.status }))}
          empty="No inventory required."
        />
      </Section>
    </DetailPage>
  );
}
