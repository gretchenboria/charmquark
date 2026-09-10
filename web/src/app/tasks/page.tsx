"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import { canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Study, Task, TaskGroup } from "@/lib/types";
import { ListPage, type Column } from "@/components/ListPage";
import { NewButton } from "@/components/NewButton";

const columns: Column[] = [
  { key: "code", header: "Code" },
  { key: "name", header: "Name" },
  { key: "risk", header: "Risk" },
  { key: "legal", header: "Legal" },
  { key: "instr", header: "Instructions" },
  { key: "ready", header: "Ready" },
];

export default function TasksPage() {
  const user = useUser();
  const [studies, setStudies] = useState<Study[]>([]);
  const [studyId, setStudyId] = useState<string | null>(null);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [rows, setRows] = useState<Task[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState("");
  const [readyFilter, setReadyFilter] = useState("");

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
    if (!studyId) return;
    api.listTasks(studyId).then(setRows).catch(() => setErr("Failed to load tasks."));
    api.listTaskGroups(studyId).then(setGroups).catch(() => undefined);
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

  const canCreate = canWriteCatalog(user?.role) && !!studyId && groups.length > 0;
  const isPM = canWriteCatalog(user?.role);
  const toolbar = (
    <>
      {studyPicker}
      <NewButton
        hidden={!(isPM && !!studyId)}
        label="New group"
        title="New task group"
        fields={[{ name: "name", label: "Group name", required: true }]}
        onCreate={(v) => api.createTaskGroup({ study_id: studyId as string, name: String(v.name) })}
        onDone={load}
      />
      <NewButton
        hidden={!canCreate}
        label="New task"
        title="New task"
        fields={[
          { name: "task_group_id", label: "Task group", type: "select", options: groups.map((g) => ({ value: g.id, label: g.name })) },
          { name: "name", label: "Name", required: true },
          {
            name: "risk_level",
            label: "Risk",
            type: "select",
            options: [
              { value: "LOW", label: "Low" },
              { value: "HIGH", label: "High" },
              { value: "UNKNOWN", label: "Unknown" },
            ],
            default: "LOW",
          },
          { name: "instructions_complete", label: "Instructions complete", type: "checkbox", default: true },
        ]}
        onCreate={(v) =>
          api.createTask({
            study_id: studyId,
            task_group_id: v.task_group_id,
            name: v.name,
            risk_level: v.risk_level,
            instructions_complete: v.instructions_complete,
            // seed a single default variant so a Low-risk task is schedulable out of the box
            variants: [{ id: "v1", name: "Default", correct: { id: "v1-c" }, errors: [] }],
          })
        }
        onDone={load}
      />
    </>
  );

  return (
    <ListPage<Task>
      title="Tasks"
      toolbar={toolbar}
      columns={columns}
      items={rows}
      search={{ toText: (t) => `${t.task_code} ${t.name}`, placeholder: "Search by code or name" }}
      filters={[
        {
          id: "risk",
          label: "All risk levels",
          value: riskFilter,
          onChange: setRiskFilter,
          accessor: (t) => t.risk_level,
          options: [
            { value: "LOW", label: "Low" },
            { value: "POTENTIAL", label: "Potential" },
            { value: "HIGH", label: "High" },
            { value: "UNKNOWN", label: "Unknown" },
          ],
        },
        {
          id: "ready",
          label: "All (readiness)",
          value: readyFilter,
          onChange: setReadyFilter,
          accessor: (t) => (t.is_ready ? "yes" : "no"),
          options: [
            { value: "yes", label: "Ready" },
            { value: "no", label: "Not ready" },
          ],
        },
      ]}
      sort={[{ id: "code", label: "Code", compare: (a, b) => a.task_code.localeCompare(b.task_code) }]}
      toRow={(t) => ({
        code: (
          <Link href={`/tasks/${t.id}`} className="text-blue-700 hover:underline">
            {t.task_code}
          </Link>
        ),
        name: t.name,
        risk: t.risk_level,
        legal: t.legal_approval,
        instr: t.instructions_complete ? "Complete" : "Incomplete",
        ready: t.is_ready ? "Ready" : "Not ready",
      })}
      empty={err ?? "No tasks for this study."}
    />
  );
}
