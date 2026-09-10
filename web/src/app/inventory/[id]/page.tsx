"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import { canDelete } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { InventoryItem, Study, Task } from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { DeleteButton } from "@/components/DeleteButton";

export default function InventoryDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [study, setStudy] = useState<Study | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getInventoryItem(id)
      .then(async (i) => {
        setItem(i);
        const [s, studyTasks] = await Promise.all([api.getStudy(i.study_id), api.listTasks(i.study_id)]);
        setStudy(s);
        setTasks(studyTasks.filter((t) => t.inventory_item_ids.includes(id)));
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
          label: "Study",
          value: study ? (
            <a href={`/studies/${study.id}`} className="text-blue-700 hover:underline">
              {study.name}
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
      <Section title={`Required by tasks (${tasks.length})`}>
        <LinkList
          items={tasks.map((t) => ({ href: `/tasks/${t.id}`, label: `${t.task_code} · ${t.name}` }))}
          empty="Not required by any task."
        />
      </Section>
    </DetailPage>
  );
}
