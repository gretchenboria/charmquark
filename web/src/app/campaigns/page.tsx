"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import { canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Campaign } from "@/lib/types";
import { ListPage, type Column } from "@/components/ListPage";
import { NewButton } from "@/components/NewButton";
import { CAMPAIGN_TYPES, optionsFor } from "@contracts";
import { useToast } from "@/components/Toast";

const columns: Column[] = [
  { key: "name", header: "Name" },
  { key: "type", header: "Type" },
  { key: "target", header: "Target N" },
  { key: "status", header: "Status" },
];

export default function CampaignsPage() {
  const user = useUser();
  const toast = useToast();
  const [rows, setRows] = useState<Campaign[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listCampaigns().then(setRows).catch(() => setErr("Backend unreachable (start it on :8787)."));
  }, []);
  useEffect(load, [load]);

  const seed = async () => {
    try {
      await api.seedSample();
      toast("success", "Sample fleet program loaded");
      load();
    } catch {
      toast("error", "Could not load sample (PM only)");
    }
  };

  const seedDemoData = async () => {
    try {
      const r = await api.seedDemo();
      toast("success", `Demo ready — ${r.confirmed_sessions} confirmed runs, ${r.missions} missions, ${r.standby} standby`);
      load();
    } catch {
      toast("error", "Could not load demo (PM only)");
    }
  };

  const isPM = canWriteCatalog(user?.role);
  const toolbar = (
    <>
      {isPM && (
        <button onClick={seedDemoData} className="rounded-md bg-[color:var(--cq-iris)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[color:var(--cq-violet)]">
          Load demo (ready to run)
        </button>
      )}
      {isPM && (
        <button onClick={seed} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
          Load sample program
        </button>
      )}
      <NewButton
        hidden={!isPM}
        label="New campaign"
        title="New campaign"
        fields={[
          { name: "name", label: "Name", required: true },
          {
            name: "campaign_type",
            label: "Type",
            type: "select",
            options: optionsFor(CAMPAIGN_TYPES),
            default: "MANIPULATION",
          },
          { name: "target_n", label: "Target N", type: "number", default: 0 },
        ]}
        onCreate={(v) =>
          api.createCampaign({ name: String(v.name), campaign_type: String(v.campaign_type), target_n: Number(v.target_n) })
        }
        onDone={load}
      />
    </>
  );

  return (
    <ListPage
      title="Campaigns"
      toolbar={toolbar}
      columns={columns}
      rows={rows.map((s) => ({
        name: (
          <Link href={`/campaigns/${s.id}`} className="font-medium text-[color:var(--cq-iris)] hover:underline">
            {s.name}
          </Link>
        ),
        type: s.campaign_type,
        target: s.target_n,
        status: s.status,
      }))}
      empty={err ?? "No campaigns yet — click “Load sample program” or “New campaign”."}
    />
  );
}
