"use client";

import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { canCreate, canDelete, ROLE_LABEL } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { User } from "@/lib/types";
import { ListPage, type Column } from "@/components/ListPage";
import { NewButton } from "@/components/NewButton";
import { useToast } from "@/components/Toast";

const ROLE_OPTIONS = [
  { value: "ROBOT_OPERATOR", label: "Robot Operator — runs runs, records QA (no catalog writes)" },
  { value: "PM", label: "PM — full create/update/delete" },
  { value: "FLEET_LEAD", label: "Fleet Lead — read-only + delete a whole campaign + legal review" },
];

const columns: Column[] = [
  { key: "name", header: "Name" },
  { key: "subject", header: "Login" },
  { key: "role", header: "Role" },
  { key: "active", header: "Active" },
  { key: "actions", header: "" },
];

export default function UsersPage() {
  const me = useUser();
  const toast = useToast();
  const [rows, setRows] = useState<User[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listUsers().then(setRows).catch(() => setErr("Backend unreachable (start it on :8000)."));
  }, []);
  useEffect(load, [load]);

  const isPM = canCreate(me?.role);

  const setRole = async (u: User, role: string) => {
    try {
      await api.updateUser(u.id, { role });
      toast("success", `${u.name} → ${role}`);
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Update failed");
    }
  };
  const remove = async (u: User) => {
    if (!window.confirm(`Delete user ${u.name}?`)) return;
    try {
      await api.deleteUser(u.id);
      toast("success", "User deleted");
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Delete failed");
    }
  };

  const toolbar = (
    <NewButton
      hidden={!isPM}
      label="New user"
      title="Add user"
      fields={[
        { name: "name", label: "Full name", required: true },
        { name: "subject", label: "Login (username / DSID)", required: true },
        { name: "email", label: "Email (optional)" },
        { name: "role", label: "Role", type: "select", options: ROLE_OPTIONS, default: "ROBOT_OPERATOR" },
      ]}
      onCreate={(v) =>
        api.createUser({ name: String(v.name), subject: String(v.subject), email: v.email ? String(v.email) : undefined, role: String(v.role) })
      }
      onDone={load}
    />
  );

  return (
    <ListPage
      title="Users & Roles"
      toolbar={toolbar}
      columns={columns}
      rows={rows.map((u) => ({
        name: u.name,
        subject: u.subject,
        role: isPM ? (
          <select
            value={u.role}
            onChange={(e) => setRole(u, e.target.value)}
            disabled={me?.name === u.name}
            title={me?.name === u.name ? "You can't change your own role" : ""}
            className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {ROLE_LABEL[o.value as keyof typeof ROLE_LABEL]}
              </option>
            ))}
          </select>
        ) : (
          ROLE_LABEL[u.role]
        ),
        active: u.is_active ? "Yes" : "No",
        actions:
          canDelete(me?.role) && me?.name !== u.name ? (
            <button onClick={() => remove(u)} className="text-xs text-red-600 hover:underline">
              Delete
            </button>
          ) : (
            ""
          ),
      }))}
      empty={err ?? "No users yet."}
    />
  );
}
