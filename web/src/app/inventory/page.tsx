"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import { canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { InventoryItem, Study } from "@/lib/types";
import { ListPage, type Column } from "@/components/ListPage";
import { NewButton } from "@/components/NewButton";

const columns: Column[] = [
  { key: "name", header: "Name" },
  { key: "kind", header: "Kind" },
  { key: "status", header: "Status" },
  { key: "available", header: "Available" },
];

export default function InventoryPage() {
  const user = useUser();
  const [studies, setStudies] = useState<Study[]>([]);
  const [studyId, setStudyId] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    api
      .listStudies()
      .then((s) => {
        setStudies(s);
        if (s.length > 0) setStudyId(s[0].id);
      })
      .catch(() => setErr("Backend unreachable (start it on :8000)."));
  }, []);

  const load = useCallback(() => {
    if (studyId) api.listInventoryItems(studyId).then(setRows).catch(() => setErr("Failed to load inventory."));
  }, [studyId]);
  useEffect(load, [load]);

  const studyPicker = (
    <select
      value={studyId ?? ""}
      onChange={(e) => setStudyId(e.target.value || null)}
      className="rounded border border-neutral-300 px-2 py-1 text-sm"
    >
      {studies.length === 0 && <option value="">No studies</option>}
      {studies.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );

  const toolbar = (
    <>
      {studyPicker}
      <NewButton
        hidden={!(canWriteCatalog(user?.role) && !!studyId)}
        label="New item"
        title="New inventory item"
        fields={[
          { name: "name", label: "Name", required: true },
          {
            name: "kind",
            label: "Kind",
            type: "select",
            options: [
              { value: "CONSUMABLE", label: "Consumable" },
              { value: "TOOL", label: "Tool" },
              { value: "PAYLOAD", label: "Payload" },
            ],
            default: "CONSUMABLE",
          },
          {
            name: "status",
            label: "Status",
            type: "select",
            options: [
              { value: "NEEDED", label: "Needed" },
              { value: "ORDERED", label: "Ordered" },
              { value: "PROCURED", label: "Procured" },
              { value: "RECEIVED", label: "Received" },
              { value: "AVAILABLE", label: "Available" },
            ],
            default: "NEEDED",
          },
        ]}
        onCreate={(v) => api.createInventoryItem({ study_id: studyId, ...v })}
        onDone={load}
      />
    </>
  );

  const statusOptions = Array.from(new Set(rows.map((i) => i.status))).sort();

  return (
    <ListPage<InventoryItem>
      title="Inventory"
      toolbar={toolbar}
      columns={columns}
      items={rows}
      search={{ toText: (i) => i.name, placeholder: "Search items" }}
      filters={[
        {
          id: "kind",
          label: "All kinds",
          value: kindFilter,
          onChange: setKindFilter,
          accessor: (i) => i.kind,
          options: [
            { value: "CONSUMABLE", label: "Consumable" },
            { value: "TOOL", label: "Tool" },
            { value: "PAYLOAD", label: "Payload" },
          ],
        },
        {
          id: "status",
          label: "All statuses",
          value: statusFilter,
          onChange: setStatusFilter,
          accessor: (i) => i.status,
          options: statusOptions.map((s) => ({ value: s, label: s })),
        },
      ]}
      sort={[
        { id: "name", label: "Name", compare: (a, b) => a.name.localeCompare(b.name) },
        { id: "status", label: "Status", compare: (a, b) => a.status.localeCompare(b.status) },
      ]}
      toRow={(i) => ({
        name: (
          <Link href={`/inventory/${i.id}`} className="text-blue-700 hover:underline">
            {i.name}
          </Link>
        ),
        kind: i.kind,
        status: i.status,
        available: i.is_available ? "Available" : "Not available",
      })}
      empty={err ?? "No inventory for this study."}
    />
  );
}
