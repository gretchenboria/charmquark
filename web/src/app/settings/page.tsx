"use client";

/**
 * Deployment settings and API tokens.
 *
 * Settings are the scheduling, risk and limit rules that used to be constants.
 * Everyone can read them (they explain what the scheduler did); a Fleet Lead
 * changes them. API tokens are how an agent — Claude Code, Gemini CLI, a
 * script — acts as you without a browser sign-in.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type ApiToken, type SettingView } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { useToast } from "@/components/Toast";
import { Section } from "@/components/DetailPage";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Lists are edited as one item per line and parsed on save. */
const toDraft = (v: unknown): unknown => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]).join("\n") : v);

function fromDraft(s: SettingView, draft: unknown): unknown {
  if (Array.isArray(s.value) && s.value.every((x) => typeof x === "string")) {
    return String(draft).split("\n").map((t) => t.trim()).filter(Boolean);
  }
  if (typeof s.value === "number") return Number(draft);
  return draft;
}

function SettingRow({ s, canEdit, onChange }: { s: SettingView; canEdit: boolean; onChange: (changes: Record<string, unknown>) => Promise<void> }) {
  const [draft, setDraft] = useState<unknown>(toDraft(s.value));
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(toDraft(s.value)), [s.value]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(s.value));

  const run = async (changes: Record<string, unknown>) => {
    setBusy(true);
    try { await onChange(changes); } finally { setBusy(false); }
  };

  let control: React.ReactNode;
  if (typeof s.value === "boolean") {
    control = (
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={!canEdit} checked={Boolean(draft)} onChange={(e) => setDraft(e.target.checked)} />
        {draft ? "On" : "Off"}
      </label>
    );
  } else if (s.key === "agents.llm_provider") {
    control = (
      <select className="cq-input w-40" disabled={!canEdit} value={String(draft)} onChange={(e) => setDraft(e.target.value)}>
        <option value="gemini">Gemini</option>
        <option value="anthropic">Anthropic (Claude)</option>
      </select>
    );
  } else if (typeof s.value === "number") {
    control = <input type="number" className="cq-input w-32" disabled={!canEdit} value={String(draft)} onChange={(e) => setDraft(e.target.value)} />;
  } else if (typeof s.value === "string") {
    control = <input type="time" className="cq-input w-32" disabled={!canEdit} value={String(draft)} onChange={(e) => setDraft(e.target.value)} />;
  } else if (s.key === "scheduling.work_days") {
    const days = draft as number[];
    control = (
      <div className="flex flex-wrap gap-3">
        {DAYS.map((d, i) => (
          <label key={d} className="inline-flex items-center gap-1 text-sm">
            <input type="checkbox" disabled={!canEdit} checked={days.includes(i + 1)}
              onChange={(e) => setDraft(e.target.checked ? [...days, i + 1].sort() : days.filter((x) => x !== i + 1))} />
            {d}
          </label>
        ))}
      </div>
    );
  } else if (typeof draft === "string") {
    control = <textarea className="cq-input w-full font-mono text-xs" rows={Math.min(10, draft.split("\n").length + 1)} disabled={!canEdit} value={draft} onChange={(e) => setDraft(e.target.value)} />;
  } else if (draft && typeof draft === "object") {
    const obj = draft as Record<string, number>;
    control = (
      <div className="flex flex-wrap gap-3">
        {Object.keys(obj).map((k) => (
          <label key={k} className="inline-flex items-center gap-1 text-sm">
            {k.toLowerCase()}
            <input type="number" min={1} className="cq-input w-20" disabled={!canEdit} value={obj[k]}
              onChange={(e) => setDraft({ ...obj, [k]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="border-b border-neutral-100 py-4 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-neutral-800">{s.label}</div>
          <div className="text-xs text-neutral-500">{s.description}</div>
        </div>
        <code className="text-[11px] text-neutral-400">{s.key}</code>
      </div>
      <div className="mt-2">{control}</div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
        {canEdit && dirty && (
          <button className="cq-btn-primary px-3 py-1 text-xs" disabled={busy} onClick={() => run({ [s.key]: fromDraft(s, draft) })}>
            {busy ? "Saving…" : "Save"}
          </button>
        )}
        {canEdit && s.overridden && (
          <button className="text-neutral-500 hover:text-neutral-800" disabled={busy} onClick={() => run({ [s.key]: null })}>Reset to default</button>
        )}
        {s.overridden ? <span>Changed by {s.updated_by ?? "unknown"} · {s.updated_at} UTC</span> : <span>Default</span>}
      </div>
    </div>
  );
}

function Tokens() {
  const toast = useToast();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState("");
  const [write, setWrite] = useState(false);
  const [days, setDays] = useState(90);
  const [fresh, setFresh] = useState<string | null>(null);

  const load = useCallback(() => { api.listTokens().then(setTokens).catch(() => setTokens([])); }, []);
  useEffect(load, [load]);

  const create = async () => {
    try {
      const t = await api.createToken({ name: name.trim(), scopes: write ? ["read", "write"] : ["read"], expires_in_days: days });
      setFresh(t.token);
      setName("");
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not create token");
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this token? Anything using it stops working immediately.")) return;
    try { await api.revokeToken(id); load(); } catch (e) { toast("error", e instanceof ApiError ? e.friendly : "Could not revoke"); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        A token lets an agent or script use the API as you — with your role, never more. Read tokens can only look;
        write tokens can make changes, which appear in each record&apos;s Activity as “agent / API token”.
      </p>
      {fresh && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="font-medium">Copy this token now — it will not be shown again.</div>
          <code className="mt-1 block break-all font-mono text-xs">{fresh}</code>
          <button className="mt-2 text-xs text-neutral-600 hover:underline" onClick={() => setFresh(null)}>Done</button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">Name
          <input className="cq-input w-64" placeholder="Claude Code on my laptop" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} /> can make changes</label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">Expires in (days)
          <input type="number" min={1} max={365} className="cq-input w-24" value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </label>
        <button className="cq-btn-primary px-3 py-1.5 text-sm" disabled={!name.trim()} onClick={create}>Create token</button>
      </div>
      <ul className="divide-y divide-neutral-100 rounded border border-neutral-200 bg-white text-sm">
        {tokens.length === 0 && <li className="px-3 py-2 text-neutral-400">No tokens.</li>}
        {tokens.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div>
              <div className="font-medium text-neutral-800">{t.name} <code className="ml-1 text-xs text-neutral-400">{t.token_prefix}…</code></div>
              <div className="text-xs text-neutral-500">
                {t.scopes.join(" + ")} · created {t.created_at} · last used {t.last_used_at ?? "never"} · expires {t.expires_at ?? "never"}
              </div>
            </div>
            {t.revoked_at
              ? <span className="text-xs text-neutral-400">revoked {t.revoked_at}</span>
              : <button className="text-xs text-red-600 hover:underline" onClick={() => revoke(t.id)}>Revoke</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SettingsPage() {
  const user = useUser();
  const toast = useToast();
  const [settings, setSettings] = useState<SettingView[] | null>(null);
  const canEdit = user?.role === "FLEET_LEAD";

  useEffect(() => { api.getSettings().then(setSettings).catch(() => setSettings([])); }, []);

  const change = async (changes: Record<string, unknown>) => {
    try {
      setSettings(await api.updateSettings(changes));
      toast("success", "Setting saved");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not save setting");
    }
  };

  const groups = [...new Set((settings ?? []).map((s) => s.group))];

  return (
    <div className="h-full overflow-auto bg-neutral-50 p-6">
      <h1 className="mb-1 text-lg font-semibold">Settings</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {canEdit ? "Changes apply immediately and are recorded in the audit trail." : "Only a Fleet Lead can change these rules."}
      </p>
      <div className="max-w-3xl">
        {settings === null && <p className="text-sm text-neutral-400">Loading…</p>}
        {groups.map((g) => (
          <Section key={g} title={g}>
            <div className="rounded border border-neutral-200 bg-white px-4">
              {settings!.filter((s) => s.group === g).map((s) => <SettingRow key={s.key} s={s} canEdit={canEdit} onChange={change} />)}
            </div>
          </Section>
        ))}
        <Section title="API tokens">
          <Tokens />
        </Section>
      </div>
    </div>
  );
}
