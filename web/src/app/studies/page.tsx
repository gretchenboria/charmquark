"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import { canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Study } from "@/lib/types";
import { ListPage, type Column } from "@/components/ListPage";
import { NewButton } from "@/components/NewButton";
import { useToast } from "@/components/Toast";

const columns: Column[] = [
  { key: "name", header: "Name" },
  { key: "type", header: "Type" },
  { key: "target", header: "Target N" },
  { key: "status", header: "Status" },
];

export default function StudiesPage() {
  const user = useUser();
  const toast = useToast();
  const [rows, setRows] = useState<Study[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listStudies().then(setRows).catch(() => setErr("Backend unreachable (start it on :8000)."));
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
      toast("success", `Demo ready — ${r.confirmed_sessions} confirmed sessions, ${r.tasks} tasks, ${r.standby} standby`);
      load();
    } catch {
      toast("error", "Could not load demo (PM only)");
    }
  };

  const isPM = canWriteCatalog(user?.role);
  const toolbar = (
    <>
      {isPM && (
        <button onClick={seedDemoData} className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
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
        label="New study"
        title="New study"
        fields={[
          { name: "name", label: "Name", required: true },
          {
            name: "study_type",
            label: "Type",
            type: "select",
            options: [
              { value: "PERCEPTION", label: "Perception" },
              { value: "MANIPULATION", label: "Manipulation" },
              { value: "NAVIGATION", label: "Navigation" },
            ],
            default: "MANIPULATION",
          },
          { name: "target_n", label: "Target N", type: "number", default: 0 },
        ]}
        onCreate={(v) =>
          api.createStudy({ name: String(v.name), study_type: String(v.study_type), target_n: Number(v.target_n) })
        }
        onDone={load}
      />
    </>
  );

  return (
    <ListPage
      title="Studies"
      toolbar={toolbar}
      columns={columns}
      rows={rows.map((s) => ({
        name: (
          <Link href={`/studies/${s.id}`} className="text-blue-700 hover:underline">
            {s.name}
          </Link>
        ),
        type: s.study_type,
        target: s.target_n,
        status: s.status,
      }))}
      empty={err ?? "No studies yet — click “Load sample program” or “New study”."}
    />
  );
}
