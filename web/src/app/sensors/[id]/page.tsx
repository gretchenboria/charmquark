"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api, ApiError } from "@/lib/api";
import { canDelete, canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Sensor, SensorRig } from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { DeleteButton } from "@/components/DeleteButton";
import { useToast } from "@/components/Toast";
import { validateField } from "@/lib/validation";

const DEVICE_TYPES = ["WATCH", "IPHONE", "AIRPODS", "INSTA360", "SENSOR", "CONTROL", "VISION_PRO"] as const;
const STATUSES = ["OPERATIONAL", "MAINTENANCE", "RETIRED"] as const;

export default function SensorDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const toast = useToast();
  const canEdit = canWriteCatalog(user?.role);
  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [fleets, setFleets] = useState<SensorRig[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    asset_name: "",
    sensor_type: "WATCH",
    status: "OPERATIONAL",
  });

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([api.getSensor(id), api.listAllSensorRigs()])
      .then(([d, allFleets]) => {
        setSensor(d);
        setForm({
          asset_name: d.asset_name,
          sensor_type: d.sensor_type,
          status: d.status,
        });
        setFleets(allFleets.filter((f) => f.sensor_ids.includes(id)));
      })
      .catch(() => setErr("Failed to load sensor."));
  }, [id]);
  useEffect(load, [load]);

  const formError = validateField(form.asset_name, { required: true, label: "Asset name" });

  const save = async () => {
    if (!sensor) return;
    if (formError) return;
    setSaving(true);
    try {
      await api.updateSensor(sensor.id, {
        asset_name: form.asset_name.trim(),
        sensor_type: form.sensor_type,
        status: form.status,
      });
      toast("success", "Sensor saved");
      setEditing(false);
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!sensor) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  const labelCls = "mb-1 block text-xs font-medium text-neutral-500";
  const inputCls = "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

  return (
    <DetailPage
      title={sensor.asset_name}
      subtitle={sensor.sensor_type}
      backHref="/sensors"
      backLabel="Sensors"
      actions={
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Edit sensor
            </button>
          )}
          <DeleteButton
            hidden={!canDelete(user?.role)}
            label="Delete sensor"
            confirm={`Delete sensor ${sensor.asset_name}?`}
            onDelete={() => api.deleteSensor(sensor.id)}
            backHref="/sensors"
          />
        </div>
      }
      fields={[
        { label: "Type", value: sensor.sensor_type },
        { label: "Status", value: sensor.status },
      ]}
    >
      {editing && (
        <Section title="Edit sensor">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={labelCls}>Asset name</span>
              <input className={inputCls} value={form.asset_name}
                onChange={(e) => setForm({ ...form, asset_name: e.target.value })} />
            </label>
            <label>
              <span className={labelCls}>Type</span>
              <select className={inputCls} value={form.sensor_type}
                onChange={(e) => setForm({ ...form, sensor_type: e.target.value })}>
                {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              <span className={labelCls}>Status</span>
              <select className={inputCls} value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
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

      <Section title={`Sensor Rigs (${fleets.length})`}>
        <LinkList
          items={fleets.map((f) => ({ label: f.name, note: `${f.sensor_ids.length} sensors` }))}
          empty="Not in any fleet."
        />
      </Section>
    </DetailPage>
  );
}
