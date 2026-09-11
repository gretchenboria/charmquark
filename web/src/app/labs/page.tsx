"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import { canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Lab } from "@/lib/types";
import { ListPage, type Column } from "@/components/ListPage";
import { NewButton } from "@/components/NewButton";
import { LAB_TYPES, optionsFor } from "@contracts";

const columns: Column[] = [
  { key: "name", header: "Name" },
  { key: "type", header: "Type" },
  { key: "available", header: "Available" },
  { key: "capacity", header: "Capacity" },
  { key: "num", header: "Code #" },
];

export default function LabsPage() {
  const user = useUser();
  const [rows, setRows] = useState<Lab[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [availFilter, setAvailFilter] = useState("");

  const load = useCallback(() => {
    api.listLabs().then(setRows).catch(() => setErr("Backend unreachable (start it on :8787)."));
  }, []);
  useEffect(load, [load]);

  const toolbar = (
    <NewButton
      hidden={!canWriteCatalog(user?.role)}
      label="New lab"
      title="New lab"
      fields={[
        { name: "name", label: "Name", required: true },
        {
          name: "type",
          label: "Type",
          type: "select",
          options: optionsFor(LAB_TYPES),
          default: "LAB_BAY",
        },
        { name: "capacity", label: "Capacity (runs/day)", type: "number", default: 4 },
        { name: "code_number", label: "Code # (for run code)", type: "number", default: 1 },
      ]}
      onCreate={(v) => api.createLab(v)}
      onDone={load}
    />
  );

  const typeOptions = Array.from(new Set(rows.map((l) => l.type))).sort();

  return (
    <ListPage<Lab>
      title="Labs"
      toolbar={toolbar}
      columns={columns}
      items={rows}
      search={{ toText: (l) => l.name, placeholder: "Search by name" }}
      filters={[
        {
          id: "type",
          label: "All types",
          value: typeFilter,
          onChange: setTypeFilter,
          accessor: (l) => l.type,
          options: typeOptions.map((t) => ({ value: t, label: t })),
        },
        {
          id: "available",
          label: "All (availability)",
          value: availFilter,
          onChange: setAvailFilter,
          accessor: (l) => (l.is_available ? "yes" : "no"),
          options: [
            { value: "yes", label: "Available" },
            { value: "no", label: "Unavailable" },
          ],
        },
      ]}
      sort={[
        { id: "name", label: "Name", compare: (a, b) => a.name.localeCompare(b.name) },
        { id: "capacity", label: "Capacity", compare: (a, b) => a.capacity - b.capacity },
      ]}
      toRow={(l) => ({
        name: (
          <Link href={`/labs/${l.id}`} className="font-medium text-[color:var(--cq-iris)] hover:underline">
            {l.name}
          </Link>
        ),
        type: l.type,
        available: l.is_available ? "Yes" : "No",
        capacity: l.capacity,
        num: l.code_number ?? "—",
      })}
      empty={err ?? "No labs yet."}
    />
  );
}
