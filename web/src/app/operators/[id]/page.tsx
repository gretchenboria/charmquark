"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api, ApiError } from "@/lib/api";
import { canDelete, canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Operator, Run } from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { DeleteButton } from "@/components/DeleteButton";
import { useToast } from "@/components/Toast";
import { validateField } from "@/lib/validation";

const ROLES = ["ROBOT_OPERATOR", "QA_REVIEWER", "FIELD_LEAD", "DATA_ENGINEER"] as const;

export default function OperatorDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const toast = useToast();
  const canEdit = canWriteCatalog(user?.role);
  const [o, setO] = useState<Operator | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    role: "ROBOT_OPERATOR",
    is_active: true,
    code_number: "" as number | "",
  });

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([api.getOperator(id), api.listRunsBy({ operator_id: id })])
      .then(([oo, ss]) => {
        setO(oo);
        setForm({
          name: "",
          role: oo.role,
          is_active: oo.is_active,
          code_number: oo.code_number ?? "",
        });
        setRuns(ss);
      })
      .catch(() => setErr("Failed to load operator."));
  }, [id]);
  useEffect(load, [load]);

  const formError = validateField(form.code_number, { numeric: true, min: 0, label: "Code #" });

  const save = async () => {
    if (!o) return;
    if (formError) return;
    setSaving(true);
    try {
      await api.updateOperator(o.id, {
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        role: form.role,
        is_active: form.is_active,
        code_number: form.code_number === "" ? null : Number(form.code_number),
      });
      toast("success", "Operator saved");
      setEditing(false);
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!o) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  const labelCls = "mb-1 block text-xs font-medium text-neutral-500";
  const inputCls = "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

  return (
    <DetailPage
      title={o.operator_code}
      subtitle={o.role}
      backHref="/operators"
      backLabel="Operators"
      actions={
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Edit operator
            </button>
          )}
          <DeleteButton
            hidden={!canDelete(user?.role)}
            label="Delete operator"
            confirm={`Delete operator ${o.operator_code}?`}
            onDelete={() => api.deleteOperator(o.id)}
            backHref="/operators"
          />
        </div>
      }
      fields={[
        { label: "Role", value: o.role },
        { label: "Active", value: o.is_active ? "Yes" : "No" },
        { label: "Code #", value: o.code_number ?? "—" },
      ]}
    >
      {editing && (
        <Section title="Edit operator">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={labelCls}>Name</span>
              <input className={inputCls} value={form.name} placeholder="Leave blank to keep current"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              <span className={labelCls}>Role</span>
              <select className={inputCls} value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label>
              <span className={labelCls}>Code #</span>
              <input type="number" className={inputCls} value={form.code_number}
                onChange={(e) => setForm({ ...form, code_number: e.target.value === "" ? "" : Number(e.target.value) })} />
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Active
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
          empty="Not moderating any run."
        />
      </Section>
    </DetailPage>
  );
}
