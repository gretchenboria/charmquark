"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import { canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Sensor, SensorRig, Campaign } from "@/lib/types";
import { ListPage, type Column } from "@/components/ListPage";
import { NewButton } from "@/components/NewButton";
import { SENSOR_TYPES, optionsFor } from "@contracts";

const columns: Column[] = [
  { key: "asset", header: "Asset name" },
  { key: "type", header: "Type" },
  { key: "status", header: "Status" },
];

export default function SensorsPage() {
  const user = useUser();
  const [rows, setRows] = useState<Sensor[]>([]);
  const [fleets, setFleets] = useState<SensorRig[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(() => {
    api.listSensors().then(setRows).catch(() => setErr("Backend unreachable (start it on :8787)."));
    api.listAllSensorRigs().then(setFleets).catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    api.listCampaigns().then((s) => {
      setCampaigns(s);
      if (s.length > 0) setCampaignId(s[0].id);
    }).catch(() => undefined);
  }, []);

  const isPM = canWriteCatalog(user?.role);
  const toolbar = (
    <>
      <NewButton
        hidden={!isPM}
        label="New sensor"
        title="New sensor"
        fields={[
          { name: "asset_name", label: "Asset name", required: true },
          {
            name: "sensor_type",
            label: "Type",
            type: "select",
            options: optionsFor(SENSOR_TYPES),
            default: SENSOR_TYPES[0],
          },
        ]}
        onCreate={(v) => api.createSensor(v)}
        onDone={load}
      />
      <NewButton
        hidden={!(isPM && !!campaignId)}
        label="New fleet"
        title="New sensor rig"
        fields={[
          { name: "name", label: "Fleet name", required: true },
          {
            name: "campaign_id",
            label: "Campaign",
            type: "select",
            options: campaigns.map((s) => ({ value: s.id, label: s.name })),
            default: campaignId ?? "",
          },
        ]}
        onCreate={(v) =>
          // create the fleet with all current sensors; can be trimmed later
          api.createSensorRig({ campaign_id: String(v.campaign_id), name: String(v.name), sensor_ids: rows.map((d) => d.id) })
        }
        onDone={load}
      />
    </>
  );

  const statusOptions = Array.from(new Set(rows.map((d) => d.status))).sort();

  return (
    <div className="flex h-full flex-col">
      <ListPage<Sensor>
        title="Sensors"
        toolbar={toolbar}
        columns={columns}
        items={rows}
        search={{ toText: (d) => d.asset_name, placeholder: "Search by asset name" }}
        filters={[
          {
            id: "type",
            label: "All types",
            value: typeFilter,
            onChange: setTypeFilter,
            accessor: (d) => d.sensor_type,
            options: optionsFor(SENSOR_TYPES),
          },
          {
            id: "status",
            label: "All statuses",
            value: statusFilter,
            onChange: setStatusFilter,
            accessor: (d) => d.status,
            options: statusOptions.map((s) => ({ value: s, label: s })),
          },
        ]}
        sort={[
          { id: "asset", label: "Asset name", compare: (a, b) => a.asset_name.localeCompare(b.asset_name) },
          { id: "type", label: "Type", compare: (a, b) => a.sensor_type.localeCompare(b.sensor_type) },
        ]}
        toRow={(d) => ({
          asset: (
            <Link href={`/sensors/${d.id}`} className="font-medium text-[color:var(--cq-iris)] hover:underline">
              {d.asset_name}
            </Link>
          ),
          type: d.sensor_type,
          status: d.status,
        })}
        empty={err ?? "No sensors yet."}
      />
      {fleets.length > 0 && (
        <div className="border-t border-neutral-200 bg-white px-6 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Sensor Rigs ({fleets.length})
          </div>
          <ul className="flex flex-wrap gap-2 text-sm">
            {fleets.map((f) => (
              <li key={f.id} className="rounded-full border border-neutral-200 px-3 py-1 text-neutral-700">
                {f.name} · {f.sensor_ids.length} sensors
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
