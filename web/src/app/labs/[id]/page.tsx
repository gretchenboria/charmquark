"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api, ApiError } from "@/lib/api";
import { canDelete, canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Lab, Run } from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { FieldGrid } from "@/components/FieldGrid";
import { ActivityPanel } from "@/components/ActivityPanel";
import { DeleteButton } from "@/components/DeleteButton";
import { useToast } from "@/components/Toast";
import { validateField } from "@/lib/validation";
import { LAB_TYPES } from "@contracts";

const TYPES = LAB_TYPES;

export default function LabDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const toast = useToast();
  const canEdit = canWriteCatalog(user?.role);
  const [l, setL] = useState<Lab | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "LAB_BAY",
    is_available: true,
    capacity: 4,
    code_number: "" as number | "",
  });

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([api.getLab(id), api.listRunsBy({ lab_id: id })])
      .then(([ll, ss]) => {
        setL(ll);
        setForm({
          name: ll.name,
          type: ll.type,
          is_available: ll.is_available,
          capacity: ll.capacity,
          code_number: ll.code_number ?? "",
        });
        setRuns(ss);
      })
      .catch(() => setErr("Failed to load lab."));
  }, [id]);
  useEffect(load, [load]);

  const formError =
    validateField(form.name, { required: true, label: "Name" }) ??
    validateField(form.capacity, { numeric: true, required: true, min: 1, label: "Capacity" }) ??
    validateField(form.code_number, { numeric: true, min: 0, label: "Code #" });

  const save = async () => {
    if (!l) return;
    if (formError) return;
    setSaving(true);
    try {
      await api.updateLab(l.id, {
        name: form.name.trim(),
        type: form.type,
        is_available: form.is_available,
        capacity: Number(form.capacity),
        code_number: form.code_number === "" ? null : Number(form.code_number),
      });
      toast("success", "Lab saved");
      setEditing(false);
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!l) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  const labelCls = "mb-1 block text-xs font-medium text-neutral-500";
  const inputCls = "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

  return (
    <DetailPage
      editor={<FieldGrid resource="labs" record={l} onSaved={(u) => setL((prev) => (prev ? { ...prev, ...u } : u))} />}
      title={l.name}
      subtitle={`${l.type} · capacity ${l.capacity}`}
      backHref="/labs"
      backLabel="Labs"
      actions={
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Edit lab
            </button>
          )}
          <DeleteButton
            hidden={!canDelete(user?.role)}
            label="Delete lab"
            confirm={`Delete lab ${l.name}?`}
            onDelete={() => api.deleteLab(l.id)}
            backHref="/labs"
          />
        </div>
      }
      fields={[
        { label: "Type", value: l.type },
        { label: "Available", value: l.is_available ? "Yes" : "No" },
        { label: "Capacity", value: l.capacity },
        { label: "Code #", value: l.code_number ?? "—" },
      ]}
    >
      {editing && (
        <Section title="Edit lab">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label>
              <span className={labelCls}>Name</span>
              <input className={inputCls} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              <span className={labelCls}>Type</span>
              <select className={inputCls} value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              <span className={labelCls}>Capacity</span>
              <input type="number" min={0} className={inputCls} value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            </label>
            <label>
              <span className={labelCls}>Code #</span>
              <input type="number" className={inputCls} value={form.code_number}
                onChange={(e) => setForm({ ...form, code_number: e.target.value === "" ? "" : Number(e.target.value) })} />
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={form.is_available}
                onChange={(e) => setForm({ ...form, is_available: e.target.checked })} />
              Available
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={save} disabled={saving || !!formError}
              className="rounded-md bg-[color:var(--cq-iris)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
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

      <Section title={`Runs (${runs.length})`}>
        <LinkList
          items={runs.map((s) => ({
            href: `/runs/${s.id}`,
            label: s.encoded_code ?? s.provisional_code ?? s.id,
            note: `${s.slot_date ?? ""} ${s.state}`,
          }))}
          empty="No runs here."
        />
      </Section>
      <Section title="Activity">
        <ActivityPanel resource="labs" entityId={l.id} refreshKey={(l as { version?: number }).version} />
      </Section>
    </DetailPage>
  );
}
