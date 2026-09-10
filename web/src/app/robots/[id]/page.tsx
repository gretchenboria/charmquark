"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api, ApiError } from "@/lib/api";
import { canDelete, canUpdate, canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Robot, Session } from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { DeleteButton } from "@/components/DeleteButton";
import { ReadinessChecklist } from "@/components/ReadinessChecklist";
import { useToast } from "@/components/Toast";

const STATUSES = [
  "POOL", "INVITED", "SURVEY_COMPLETED", "SELECTED", "EXCLUDED",
  "ENROLLED", "SCHEDULED", "ACTIVE", "COLLECTED",
] as const;

export default function RobotDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const toast = useToast();
  const canEdit = canWriteCatalog(user?.role);
  const [p, setP] = useState<Robot | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    status: "",
    safety_certified: false,
    calibration_valid: false,
    commissioned: false,
    is_standby: false,
  });

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([api.getRobot(id), api.listSessionsBy({ robot_id: id })])
      .then(([pp, ss]) => {
        setP(pp);
        setForm({
          name: "",
          email: "",
          status: pp.status,
          safety_certified: pp.safety_certified,
          calibration_valid: pp.calibration_valid,
          commissioned: pp.commissioned,
          is_standby: pp.is_standby,
        });
        setSessions(ss);
      })
      .catch(() => setErr("Failed to load robot."));
  }, [id]);
  useEffect(load, [load]);

  const toggle = async (key: string, done: boolean) => {
    if (!p) return;
    await api.updateRobot(p.id, { [key]: done });
    load();
  };

  const save = async () => {
    if (!p) return;
    setSaving(true);
    try {
      await api.updateRobot(p.id, {
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        status: form.status,
        safety_certified: form.safety_certified,
        calibration_valid: form.calibration_valid,
        commissioned: form.commissioned,
        is_standby: form.is_standby,
      });
      toast("success", "Robot saved");
      setEditing(false);
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!p) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  const labelCls = "mb-1 block text-xs font-medium text-neutral-500";
  const inputCls = "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

  return (
    <DetailPage
      title={p.robot_code}
      subtitle={p.is_cleared ? "Cleared to participate" : "Not cleared — mark items below"}
      backHref="/robots"
      backLabel="Robots"
      actions={
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Edit robot
            </button>
          )}
          <DeleteButton
            hidden={!canDelete(user?.role)}
            label="Delete robot"
            confirm={`Delete robot ${p.robot_code}?`}
            onDelete={() => api.deleteRobot(p.id)}
            backHref="/robots"
          />
        </div>
      }
      fields={[
        { label: "Status", value: p.status },
        { label: "Cleared", value: p.is_cleared ? "Yes" : "No" },
      ]}
    >
      {editing && (
        <Section title="Edit robot">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={labelCls}>Name</span>
              <input className={inputCls} value={form.name} placeholder="Leave blank to keep current"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              <span className={labelCls}>Email</span>
              <input className={inputCls} value={form.email} placeholder="Leave blank to keep current"
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>
              <span className={labelCls}>Status</span>
              <select className={inputCls} value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={form.safety_certified}
                onChange={(e) => setForm({ ...form, safety_certified: e.target.checked })} />
              Consent signed
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={form.calibration_valid}
                onChange={(e) => setForm({ ...form, calibration_valid: e.target.checked })} />
              Ask survey complete
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={form.commissioned}
                onChange={(e) => setForm({ ...form, commissioned: e.target.checked })} />
              Commissioned
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={form.is_standby}
                onChange={(e) => setForm({ ...form, is_standby: e.target.checked })} />
              Standby (pre-agreed to fill in on short notice)
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={save} disabled={saving}
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setEditing(false); load(); }}
              className="rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50">
              Cancel
            </button>
          </div>
        </Section>
      )}

      <Section title="Clearance checklist">
        <p className="mb-2 text-xs text-neutral-400">
          These come from external apps (consent, Ask survey, Bookable) that aren’t integrated,
          so a PM or Robot Operator marks each done here. All must be checked before this robot
          can be added to a session.
        </p>
        <ReadinessChecklist items={p.checklist ?? []} canEdit={canUpdate(user?.role)} onToggle={toggle} />
      </Section>

      <Section title={`Sessions (${sessions.length})`}>
        <LinkList
          items={sessions.map((s) => ({
            href: `/sessions/${s.id}`,
            label: s.encoded_code ?? s.provisional_code ?? s.id,
            note: `${s.slot_date ?? ""} ${s.state}`,
          }))}
          empty="Not assigned to any session."
        />
      </Section>
    </DetailPage>
  );
}
