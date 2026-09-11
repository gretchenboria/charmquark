"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import { canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Robot } from "@/lib/types";
import { ListPage, type Column } from "@/components/ListPage";
import { NewButton } from "@/components/NewButton";

const yn = (b: boolean) => (b ? "Yes" : "No");

const columns: Column[] = [
  { key: "code", header: "Code" },
  { key: "status", header: "Status" },
  { key: "safety", header: "Safety cert" },
  { key: "calibration", header: "Calibration" },
  { key: "commissioned", header: "Commissioned" },
  { key: "cleared", header: "Cleared" },
];

export default function RobotsPage() {
  const user = useUser();
  const [rows, setRows] = useState<Robot[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [clearedFilter, setClearedFilter] = useState("");

  const load = useCallback(() => {
    api.listRobots().then(setRows).catch(() => setErr("Backend unreachable (start it on :8787)."));
  }, []);
  useEffect(load, [load]);

  const toolbar = (
    <NewButton
      hidden={!canWriteCatalog(user?.role)}
      label="New robot"
      title="New robot"
      fields={[
        { name: "safety_certified", label: "Safety certified", type: "checkbox" },
        { name: "calibration_valid", label: "Calibration valid", type: "checkbox" },
        { name: "commissioned", label: "Commissioned (in service)", type: "checkbox" },
      ]}
      onCreate={(v) => api.createRobot(v)}
      onDone={load}
    />
  );

  const statusOptions = Array.from(new Set(rows.map((p) => p.status))).sort();

  return (
    <ListPage<Robot>
      title="Robots"
      toolbar={toolbar}
      columns={columns}
      items={rows}
      search={{ toText: (p) => p.robot_code, placeholder: "Search by code" }}
      filters={[
        {
          id: "status",
          label: "All statuses",
          value: statusFilter,
          onChange: setStatusFilter,
          accessor: (p) => p.status,
          options: statusOptions.map((s) => ({ value: s, label: s })),
        },
        {
          id: "cleared",
          label: "All (cleared)",
          value: clearedFilter,
          onChange: setClearedFilter,
          accessor: (p) => (p.is_cleared ? "yes" : "no"),
          options: [
            { value: "yes", label: "Cleared" },
            { value: "no", label: "Not cleared" },
          ],
        },
      ]}
      sort={[{ id: "code", label: "Code", compare: (a, b) => a.robot_code.localeCompare(b.robot_code) }]}
      toRow={(p) => ({
        code: (
          <Link href={`/robots/${p.id}`} className="font-medium text-[color:var(--cq-iris)] hover:underline">
            {p.robot_code}
          </Link>
        ),
        status: p.status,
        safety: yn(p.safety_certified),
        calibration: yn(p.calibration_valid),
        commissioned: yn(p.commissioned),
        cleared: p.is_cleared ? "Cleared" : "Not cleared",
      })}
      empty={err ?? "No robots yet."}
    />
  );
}
