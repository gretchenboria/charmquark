"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api, ApiError } from "@/lib/api";
import { canDelete, canUpdate, canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { ChecklistItem, InventoryItem, Campaign, MissionDetail, MissionGroup } from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { DeleteButton } from "@/components/DeleteButton";
import { ReadinessChecklist } from "@/components/ReadinessChecklist";
import { RiskLegalPanel } from "@/components/RiskLegalPanel";
import { MissionInstructionsPanel } from "@/components/MissionInstructionsPanel";
import { VariantsEditor } from "@/components/VariantsEditor";
import { useToast } from "@/components/Toast";
import { validateField } from "@/lib/validation";

const DURATIONS = ["SHORT", "MEDIUM", "LONG", "UNSPECIFIED"] as const;

export default function MissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const toast = useToast();
  const canEdit = canWriteCatalog(user?.role);
  const canEditInstructions = canUpdate(user?.role);
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [group, setGroup] = useState<MissionGroup | null>(null);
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
      .getMission(id)
      .then(async (t) => {
        setMission(t);
        setForm({
          name: t.name,
          duration_type: t.duration_type,
          reps_target: t.reps_target,
        });
        const [s, invAll] = await Promise.all([
          api.getCampaign(t.campaign_id),
          api.listInventoryItems(t.campaign_id),
        ]);
        setCampaign(s);
        setInv(invAll.filter((i) => t.inventory_item_ids.includes(i.id)));
        if (t.mission_group_id) setGroup(await api.getMissionGroup(t.mission_group_id));
      })
      .catch(() => setErr("Failed to load mission."));
  }, [id]);
  useEffect(load, [load]);

  const formError =
    validateField(form.name, { required: true, label: "Name" }) ??
    validateField(form.reps_target, { numeric: true, required: true, min: 0, label: "Repetitions target" });

  const save = async () => {
    if (!mission) return;
    if (formError) return;
    setSaving(true);
    try {
      await api.updateMission(mission.id, {
        name: form.name.trim(),
        duration_type: form.duration_type,
        reps_target: Number(form.reps_target),
      });
      toast("success", "Mission saved");
      setEditing(false);
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!mission) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  const invReady = inv.length === 0 || inv.every((i) => i.status === "AVAILABLE" || i.status === "PROCURED");
  const checklist: ChecklistItem[] = [
    { key: "instructions_complete", label: "Instructions complete", done: mission.instructions_complete, source: "manual" },
    { key: "variants", label: "Variants defined", done: mission.variants.length > 0, source: "auto" },
    { key: "risk_cleared", label: "Risk cleared (low or legal-approved)", done: mission.risk_level === "LOW" || mission.legal_approval === "APPROVED", source: "auto" },
    { key: "inventory_ready", label: "All tools/parts/consumables ready", done: invReady, source: "auto" },
    { key: "ready", label: "Ready to schedule", done: mission.is_ready, source: "auto" },
  ];

  const labelCls = "mb-1 block text-xs font-medium text-neutral-500";
  const inputCls = "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

  return (
    <DetailPage
      title={`${mission.mission_code} · ${mission.name}`}
      subtitle={mission.is_ready ? "Ready to schedule" : "Not ready"}
      backHref="/missions"
      backLabel="Missions"
      actions={
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Edit mission
            </button>
          )}
          <DeleteButton
            hidden={!canDelete(user?.role)}
            label="Delete mission"
            confirm={`Delete mission ${mission.mission_code}?`}
            onDelete={() => api.deleteMission(mission.id)}
            backHref="/missions"
          />
        </div>
      }
      fields={[
        {
          label: "Campaign",
          value: campaign ? (
            <a href={`/campaigns/${campaign.id}`} className="font-medium text-[color:var(--cq-iris)] hover:underline">
              {campaign.name}
            </a>
          ) : (
            "—"
          ),
        },
        { label: "Mission Group", value: group?.name ?? "—" },
        { label: "Risk", value: mission.risk_level },
        { label: "Legal", value: mission.legal_approval },
        { label: "Size", value: mission.duration_type },
        { label: "Reps", value: `${mission.reps_actual}/${mission.reps_target}` },
        { label: "Instructions", value: mission.instructions_complete ? "Complete" : "Incomplete" },
        { label: "Ready", value: mission.is_ready ? "Yes" : "No" },
      ]}
    >
      {editing && (
        <Section title="Edit mission">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={labelCls}>Code</span>
              <div className={`${inputCls} bg-neutral-50 text-neutral-500`}>{mission.mission_code}</div>
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
      <Section title="Readiness">
        <ReadinessChecklist items={checklist} canEdit={false} />
      </Section>
      <Section title="Risk & Legal">
        <RiskLegalPanel mission={mission} role={user?.role} onChanged={load} />
      </Section>
      <Section title="Instructions">
        <MissionInstructionsPanel missionId={mission.id} canEdit={canEditInstructions} />
      </Section>
      <Section title={`Variants & errors (${mission.variants.length})`}>
        <VariantsEditor mission={mission} canEdit={canEdit} onSaved={load} />
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
