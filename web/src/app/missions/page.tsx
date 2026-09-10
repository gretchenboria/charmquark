"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import { canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Campaign, Mission, MissionGroup } from "@/lib/types";
import { ListPage, type Column } from "@/components/ListPage";
import { NewButton } from "@/components/NewButton";

const columns: Column[] = [
  { key: "code", header: "Code" },
  { key: "name", header: "Name" },
  { key: "risk", header: "Risk" },
  { key: "legal", header: "Legal" },
  { key: "instr", header: "Instructions" },
  { key: "ready", header: "Ready" },
];

export default function MissionsPage() {
  const user = useUser();
  const [campaigns, setStudies] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [groups, setGroups] = useState<MissionGroup[]>([]);
  const [rows, setRows] = useState<Mission[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState("");
  const [readyFilter, setReadyFilter] = useState("");

  useEffect(() => {
    api
      .listStudies()
      .then((s) => {
        setStudies(s);
        if (s.length > 0) setCampaignId(s[0].id);
      })
      .catch(() => setErr("Backend unreachable (start it on :8000)."));
  }, []);

  const load = useCallback(() => {
    if (!campaignId) return;
    api.listMissions(campaignId).then(setRows).catch(() => setErr("Failed to load missions."));
    api.listMissionGroups(campaignId).then(setGroups).catch(() => undefined);
  }, [campaignId]);
  useEffect(load, [load]);

  const studyPicker = (
    <select
      value={campaignId ?? ""}
      onChange={(e) => setCampaignId(e.target.value || null)}
      className="cq-select"
    >
      {campaigns.length === 0 && <option value="">No campaigns</option>}
      {campaigns.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );

  const canCreate = canWriteCatalog(user?.role) && !!campaignId && groups.length > 0;
  const isPM = canWriteCatalog(user?.role);
  const toolbar = (
    <>
      {studyPicker}
      <NewButton
        hidden={!(isPM && !!campaignId)}
        label="New group"
        title="New mission group"
        fields={[{ name: "name", label: "Group name", required: true }]}
        onCreate={(v) => api.createMissionGroup({ campaign_id: campaignId as string, name: String(v.name) })}
        onDone={load}
      />
      <NewButton
        hidden={!canCreate}
        label="New mission"
        title="New mission"
        fields={[
          { name: "mission_group_id", label: "Mission group", type: "select", options: groups.map((g) => ({ value: g.id, label: g.name })) },
          { name: "name", label: "Name", required: true },
          {
            name: "risk_level",
            label: "Risk",
            type: "select",
            options: [
              { value: "LOW", label: "Low" },
              { value: "HIGH", label: "High" },
              { value: "UNKNOWN", label: "Unknown" },
            ],
            default: "LOW",
          },
          { name: "instructions_complete", label: "Instructions complete", type: "checkbox", default: true },
        ]}
        onCreate={(v) =>
          api.createMission({
            campaign_id: campaignId,
            mission_group_id: v.mission_group_id,
            name: v.name,
            risk_level: v.risk_level,
            instructions_complete: v.instructions_complete,
            // seed a single default variant so a Low-risk mission is schedulable out of the box
            variants: [{ id: "v1", name: "Default", correct: { id: "v1-c" }, errors: [] }],
          })
        }
        onDone={load}
      />
    </>
  );

  return (
    <ListPage<Mission>
      title="Missions"
      toolbar={toolbar}
      columns={columns}
      items={rows}
      search={{ toText: (t) => `${t.mission_code} ${t.name}`, placeholder: "Search by code or name" }}
      filters={[
        {
          id: "risk",
          label: "All risk levels",
          value: riskFilter,
          onChange: setRiskFilter,
          accessor: (t) => t.risk_level,
          options: [
            { value: "LOW", label: "Low" },
            { value: "POTENTIAL", label: "Potential" },
            { value: "HIGH", label: "High" },
            { value: "UNKNOWN", label: "Unknown" },
          ],
        },
        {
          id: "ready",
          label: "All (readiness)",
          value: readyFilter,
          onChange: setReadyFilter,
          accessor: (t) => (t.is_ready ? "yes" : "no"),
          options: [
            { value: "yes", label: "Ready" },
            { value: "no", label: "Not ready" },
          ],
        },
      ]}
      sort={[{ id: "code", label: "Code", compare: (a, b) => a.mission_code.localeCompare(b.mission_code) }]}
      toRow={(t) => ({
        code: (
          <Link href={`/missions/${t.id}`} className="font-medium text-[color:var(--cq-iris)] hover:underline">
            {t.mission_code}
          </Link>
        ),
        name: t.name,
        risk: t.risk_level,
        legal: t.legal_approval,
        instr: t.instructions_complete ? "Complete" : "Incomplete",
        ready: t.is_ready ? "Ready" : "Not ready",
      })}
      empty={err ?? "No missions for this campaign."}
    />
  );
}
