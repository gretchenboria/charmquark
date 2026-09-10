"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import { canDelete } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { InventoryItem, Campaign, Mission } from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { DeleteButton } from "@/components/DeleteButton";

export default function InventoryDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getInventoryItem(id)
      .then(async (i) => {
        setItem(i);
        const [s, studyMissions] = await Promise.all([api.getCampaign(i.campaign_id), api.listMissions(i.campaign_id)]);
        setCampaign(s);
        setMissions(studyMissions.filter((t) => t.inventory_item_ids.includes(id)));
      })
      .catch(() => setErr("Failed to load inventory item."));
  }, [id]);

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!item) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  return (
    <DetailPage
      title={item.name}
      subtitle={`${item.kind} · ${item.status}`}
      backHref="/inventory"
      backLabel="Inventory"
      actions={
        <DeleteButton
          hidden={!canDelete(user?.role)}
          label="Delete item"
          confirm={`Delete inventory item ${item.name}?`}
          onDelete={() => api.deleteInventoryItem(item.id)}
          backHref="/inventory"
        />
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
        { label: "Kind", value: item.kind },
        { label: "Status", value: item.status },
        { label: "Available", value: item.is_available ? "Yes" : "No" },
      ]}
    >
      <Section title={`Required by missions (${missions.length})`}>
        <LinkList
          items={missions.map((t) => ({ href: `/missions/${t.id}`, label: `${t.mission_code} · ${t.name}` }))}
          empty="Not required by any mission."
        />
      </Section>
    </DetailPage>
  );
}
