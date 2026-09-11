"use client";

/**
 * Every field of a record, driven by the contract registry: editable in place
 * when your role may change it, otherwise shown locked with the reason — so no
 * value is ever mysteriously frozen. Saves send the record's version as
 * If-Match; if someone else changed it first, the latest values are loaded and
 * you are told to reapply.
 */
import { useState } from "react";
import { RESOURCES, labelFor, optionsFor, type FieldSpec, type ResourceName } from "@contracts";
import { ApiError, api } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { useToast } from "./Toast";

type Rec = { id: string; version?: number } & Record<string, unknown>;

/** Types edited inline. References, lists and structured values have dedicated controls elsewhere. */
const INLINE = new Set<FieldSpec["type"]>(["string", "text", "integer", "number", "boolean", "enum", "date", "time"]);

function display(f: FieldSpec, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (f.type === "boolean") return v ? "Yes" : "No";
  if (f.type === "enum" && typeof v === "string") return labelFor(v);
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  if (typeof v === "object") return "Set";
  return String(v);
}

function toValue(f: FieldSpec, draft: string): unknown {
  if (draft === "" && f.nullable) return null;
  if (f.type === "integer" || f.type === "number") return draft === "" ? null : Number(draft);
  return draft;
}

const Lock = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export function FieldGrid<T extends { id: string }>({
  resource,
  record,
  onSaved,
  hide = [],
}: {
  resource: ResourceName;
  record: T;
  onSaved: (updated: T) => void;
  hide?: string[];
}) {
  const spec = RESOURCES[resource];
  const rec = record as unknown as Rec;
  const user = useUser();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const canWrite = !!user && (spec.roles.write as readonly string[]).includes(user.role);

  const save = async (name: string, value: unknown) => {
    setSaving(true);
    try {
      const updated = await api.updateRecord<T>(spec.path, rec.id, { [name]: value }, rec.version);
      onSaved({ ...record, ...updated });
      setEditing(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const current = (e.detail as { current?: T } | undefined)?.current;
        if (current) onSaved({ ...record, ...current });
        setEditing(null);
        toast("error", "Someone else changed this record first — the latest values are loaded. Reapply your edit.");
      } else {
        toast("error", e instanceof ApiError ? e.friendly : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const fields = Object.entries(spec.fields as Record<string, FieldSpec>)
    .filter(([name]) => name !== "id" && name !== "version" && !hide.includes(name) && name in rec);

  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[180px_1fr]">
      {fields.map(([name, f]) => {
        const value = rec[name];
        const locked =
          f.readonly ??
          (f.writeRoles && user && !(f.writeRoles as readonly string[]).includes(user.role)
            ? (f.writeRolesReason ?? `requires ${f.writeRoles.join(", ")}`)
            : !canWrite
              ? "your role can view but not change this"
              : !INLINE.has(f.type)
                ? "not editable inline"
                : null);

        return (
          <div key={name} className="contents">
            <dt className="pt-1 text-neutral-400">{f.label}</dt>
            <dd className="min-h-[28px] text-neutral-800">
              {editing === name ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); void save(name, toValue(f, draft)); }}
                >
                  {f.type === "enum" ? (
                    <select className="cq-input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus>
                      {f.nullable && <option value="">—</option>}
                      {optionsFor(f.values ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === "text" ? (
                    <textarea className="cq-input w-full" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                  ) : (
                    <>
                      <input
                        className="cq-input"
                        type={f.type === "integer" || f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text"}
                        min={f.min}
                        step={f.type === "integer" ? 1 : undefined}
                        list={f.suggestions ? `${resource}-${name}-options` : undefined}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        autoFocus
                      />
                      {f.suggestions && (
                        <datalist id={`${resource}-${name}-options`}>
                          {f.suggestions.map((s) => <option key={s} value={s}>{labelFor(s)}</option>)}
                        </datalist>
                      )}
                    </>
                  )}
                  <button type="submit" className="cq-btn-primary px-3 py-1 text-xs" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                  <button type="button" className="text-xs text-neutral-500 hover:text-neutral-800" onClick={() => setEditing(null)}>Cancel</button>
                </form>
              ) : f.type === "boolean" && !locked ? (
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={Boolean(value)} disabled={saving} onChange={(e) => void save(name, e.target.checked)} />
                  <span>{value ? "Yes" : "No"}</span>
                </label>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>{display(f, value)}</span>
                  {locked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-400" title={locked}>
                      <Lock /> {locked}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="text-xs font-medium text-[color:var(--cq-iris)] hover:underline"
                      onClick={() => { setDraft(value === null || value === undefined ? "" : String(value)); setEditing(name); }}
                    >
                      Edit
                    </button>
                  )}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
