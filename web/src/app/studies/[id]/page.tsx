"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import { canDeleteStudy } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { DeviceFleet, InventoryItem, Session, Study, Task, TaskGroup } from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { DeleteButton } from "@/components/DeleteButton";

export default function StudyDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const [study, setStudy] = useState<Study | null>(null);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inv, setInv] = useState<InventoryItem[]>([]);
  const [fleets, setFleets] = useState<DeviceFleet[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getStudy(id),
      api.listTaskGroups(id),
      api.listTasks(id),
      api.listInventoryItems(id),
      api.listDeviceFleets(id),
      api.listSessionsBy({ study_id: id }),
    ])
      .then(([s, g, t, i, f, ss]) => {
        setStudy(s);
        setGroups(g);
        setTasks(t);
        setInv(i);
        setFleets(f);
        setSessions(ss);
      })
      .catch(() => setErr("Failed to load study."));
  }, [id]);

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!study) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  return (
    <DetailPage
      title={study.name}
      subtitle={`${study.study_type} · target N ${study.target_n}`}
      backHref="/studies"
      backLabel="Studies"
      actions={
        <DeleteButton
          hidden={!canDeleteStudy(user?.role)}
          label="Delete study"
          confirm={`Delete “${study.name}” and all its tasks, inventory, fleets and sessions?`}
          onDelete={() => api.deleteStudy(study.id)}
          backHref="/studies"
        />
      }
      fields={[
        { label: "Type", value: study.study_type },
        { label: "Target N", value: study.target_n },
        { label: "Status", value: study.status },
      ]}
    >
      <Section title={`Task Groups (${groups.length})`}>
        <LinkList items={groups.map((g) => ({ label: g.name }))} />
      </Section>
      <Section title={`Tasks (${tasks.length})`}>
        <LinkList
          items={tasks.map((t) => ({
            href: `/tasks/${t.id}`,
            label: `${t.task_code} · ${t.name}`,
            note: t.is_ready ? "Ready" : "Not ready",
          }))}
        />
      </Section>
      <Section title={`Inventory (${inv.length})`}>
        <LinkList items={inv.map((i) => ({ href: `/inventory/${i.id}`, label: i.name, note: i.status }))} />
      </Section>
      <Section title={`Device Fleets (${fleets.length})`}>
        <LinkList items={fleets.map((f) => ({ label: f.name, note: `${f.device_ids.length} devices` }))} />
      </Section>
      <Section title={`Sessions (${sessions.length})`}>
        <LinkList
          items={sessions.map((s) => ({
            href: `/sessions/${s.id}`,
            label: s.encoded_code ?? s.provisional_code ?? s.id,
            note: `${s.slot_date ?? ""} ${s.state}`,
          }))}
        />
      </Section>
    </DetailPage>
  );
}
