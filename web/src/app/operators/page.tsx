"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import { canWriteCatalog } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Operator } from "@/lib/types";
import { ListPage, type Column } from "@/components/ListPage";
import { NewButton } from "@/components/NewButton";

const columns: Column[] = [
  { key: "code", header: "Code" },
  { key: "role", header: "Role" },
  { key: "active", header: "Active" },
  { key: "num", header: "Code #" },
];

export default function OperatorsPage() {
  const user = useUser();
  const [rows, setRows] = useState<Operator[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const load = useCallback(() => {
    api.listOperators().then(setRows).catch(() => setErr("Backend unreachable (start it on :8000)."));
  }, []);
  useEffect(load, [load]);

  const toolbar = (
    <NewButton
      hidden={!canWriteCatalog(user?.role)}
      label="New operator"
      title="New operator"
      fields={[
        { name: "name", label: "Name", required: true },
        {
          name: "role",
          label: "Role",
          type: "select",
          options: [
            { value: "ROBOT_OPERATOR", label: "Robot Operator" },
            { value: "QA_REVIEWER", label: "QA Reviewer" },
            { value: "FIELD_LEAD", label: "Field Lead" },
            { value: "DATA_ENGINEER", label: "Data Engineer" },
          ],
          default: "ROBOT_OPERATOR",
        },
      ]}
      onCreate={(v) => api.createOperator(v)}
      onDone={load}
    />
  );

  const roleOptions = Array.from(new Set(rows.map((o) => o.role))).sort();

  return (
    <ListPage<Operator>
      title="Operators"
      toolbar={toolbar}
      columns={columns}
      items={rows}
      search={{ toText: (o) => o.operator_code, placeholder: "Search by code" }}
      filters={[
        {
          id: "role",
          label: "All roles",
          value: roleFilter,
          onChange: setRoleFilter,
          accessor: (o) => o.role,
          options: roleOptions.map((r) => ({ value: r, label: r })),
        },
        {
          id: "active",
          label: "All (active)",
          value: activeFilter,
          onChange: setActiveFilter,
          accessor: (o) => (o.is_active ? "yes" : "no"),
          options: [
            { value: "yes", label: "Active" },
            { value: "no", label: "Inactive" },
          ],
        },
      ]}
      sort={[{ id: "code", label: "Code", compare: (a, b) => a.operator_code.localeCompare(b.operator_code) }]}
      toRow={(o) => ({
        code: (
          <Link href={`/operators/${o.id}`} className="font-medium text-[color:var(--cq-iris)] hover:underline">
            {o.operator_code}
          </Link>
        ),
        role: o.role,
        active: o.is_active ? "Yes" : "No",
        num: o.code_number ?? "—",
      })}
      empty={err ?? "No operators yet."}
    />
  );
}
