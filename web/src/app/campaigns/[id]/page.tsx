"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import { canDeleteCampaign } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { SensorRig, InventoryItem, Run, Campaign, Mission, MissionGroup } from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { FieldGrid } from "@/components/FieldGrid";
import { ActivityPanel } from "@/components/ActivityPanel";
import { DeleteButton } from "@/components/DeleteButton";

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [groups, setGroups] = useState<MissionGroup[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [inv, setInv] = useState<InventoryItem[]>([]);
  const [fleets, setFleets] = useState<SensorRig[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getCampaign(id),
      api.listMissionGroups(id),
      api.listMissions(id),
      api.listInventoryItems(id),
      api.listSensorRigs(id),
      api.listRunsBy({ campaign_id: id }),
    ])
      .then(([s, g, t, i, f, ss]) => {
        setCampaign(s);
        setGroups(g);
        setMissions(t);
        setInv(i);
        setFleets(f);
        setRuns(ss);
      })
      .catch(() => setErr("Failed to load campaign."));
  }, [id]);

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!campaign) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  return (
    <DetailPage
      editor={<FieldGrid resource="campaigns" record={campaign} onSaved={(u) => setCampaign((prev) => (prev ? { ...prev, ...u } : u))} />}
      title={campaign.name}
      subtitle={`${campaign.campaign_type} · target N ${campaign.target_n}`}
      backHref="/campaigns"
      backLabel="Campaigns"
      actions={
        <DeleteButton
          hidden={!canDeleteCampaign(user?.role)}
          label="Delete campaign"
          confirm={`Delete “${campaign.name}” and all its missions, inventory, fleets and runs?`}
          onDelete={() => api.deleteCampaign(campaign.id)}
          backHref="/campaigns"
        />
      }
      fields={[
        { label: "Type", value: campaign.campaign_type },
        { label: "Target N", value: campaign.target_n },
        { label: "Status", value: campaign.status },
      ]}
    >
      <Section title={`Mission Groups (${groups.length})`}>
        <LinkList items={groups.map((g) => ({ label: g.name }))} />
      </Section>
      <Section title={`Missions (${missions.length})`}>
        <LinkList
          items={missions.map((t) => ({
            href: `/missions/${t.id}`,
            label: `${t.mission_code} · ${t.name}`,
            note: t.is_ready ? "Ready" : "Not ready",
          }))}
        />
      </Section>
      <Section title={`Inventory (${inv.length})`}>
        <LinkList items={inv.map((i) => ({ href: `/inventory/${i.id}`, label: i.name, note: i.status }))} />
      </Section>
      <Section title={`Sensor Rigs (${fleets.length})`}>
        <LinkList items={fleets.map((f) => ({ label: f.name, note: `${f.sensor_ids.length} sensors` }))} />
      </Section>
      <Section title={`Runs (${runs.length})`}>
        <LinkList
          items={runs.map((s) => ({
            href: `/runs/${s.id}`,
            label: s.encoded_code ?? s.provisional_code ?? s.id,
            note: `${s.slot_date ?? ""} ${s.state}`,
          }))}
        />
      </Section>
      <Section title="Activity">
        <ActivityPanel resource="campaigns" entityId={campaign.id} refreshKey={(campaign as { version?: number }).version} />
      </Section>
    </DetailPage>
  );
}
