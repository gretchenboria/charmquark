"use client";

import type { ReactNode } from "react";
import type { Campaign } from "@/lib/types";

/** A page header with a title and a campaign selector (used by dashboard + reports). */
export function CampaignHeader({
  title,
  campaigns,
  campaignId,
  onChange,
  right,
}: {
  title: string;
  campaigns: Campaign[];
  campaignId: string | null;
  onChange: (id: string | null) => void;
  right?: ReactNode;
}) {
  return (
    <header className="cq-topbar flex items-center gap-4 px-6 py-3.5">
      <h1 className="cq-display text-lg font-semibold text-[color:var(--cq-ink)]">{title}</h1>
      <select
        value={campaignId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="cq-select"
      >
        {campaigns.length === 0 && <option value="">No campaigns</option>}
        {campaigns.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="ml-auto flex items-center gap-2">{right}</div>
    </header>
  );
}
