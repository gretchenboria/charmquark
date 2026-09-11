"use client";

// BPMN 2.0 designer bound to the CharmQuark service catalogue (@contracts workflows).
// bpmn-js touches the DOM, so it is imported lazily inside an effect and torn down on
// unmount. The palette and menus offer only the elements the API accepts; the side
// panel binds the selected task to a service and lists the problems the API finds.
// Saves send If-Match, and every replaced diagram is kept as a version History reopens.
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";

import { useCallback, useEffect, useRef, useState } from "react";
import type Modeler from "bpmn-js/lib/Modeler";
import { CQ_MODDLE, RESOURCES, WORKFLOW_SERVICES, serviceById, type BpmnProblem, type BpmnReport } from "@contracts";

import { api, ApiError } from "@/lib/api";
import type { WorkflowVersionSummary } from "@/lib/types";
import { useToast } from "@/components/Toast";

// ---------------------------------------------------------------- bpmn-js plumbing
type Entries = Record<string, unknown>;
const pick = (entries: Entries, keep: (key: string) => boolean): Entries =>
  Object.fromEntries(Object.entries(entries).filter(([k]) => keep(k)));

const PALETTE_KEEP = new Set([
  "hand-tool", "lasso-tool", "space-tool", "global-connect-tool", "tool-separator",
  "create.start-event", "create.end-event", "create.exclusive-gateway", "create.task",
]);
const CONTEXT_PAD_DROP = /intermediate-event|receive-task|compensation/;
const REPLACE_KEEP = new Set([
  "replace-with-none-start", "replace-with-none-end", "replace-with-task", "replace-with-service-task",
  "replace-with-user-task", "replace-with-exclusive-gateway", "replace-with-parallel-gateway",
]);

interface Registrar {
  registerProvider: (...args: unknown[]) => void;
}

/** Trims the palette, context pad and replace menu to the elements CharmQuark accepts. */
function CqRestrictions(palette: Registrar, contextPad: Registrar, popupMenu: Registrar) {
  palette.registerProvider(500, { getPaletteEntries: () => (e: Entries) => pick(e, (k) => PALETTE_KEEP.has(k)) });
  contextPad.registerProvider(500, { getContextPadEntries: () => (e: Entries) => pick(e, (k) => !CONTEXT_PAD_DROP.test(k)) });
  popupMenu.registerProvider("bpmn-replace", 500, {
    // Sequence-flow options (default/conditional) stay; element types are limited.
    getPopupMenuEntries: () => (e: Entries) => pick(e, (k) => REPLACE_KEEP.has(k) || /flow$/.test(k)),
  });
}
CqRestrictions.$inject = ["palette", "contextPad", "popupMenu"];
const cqRestrictions = { __init__: ["cqRestrictions"], cqRestrictions: ["type", CqRestrictions] };

interface El {
  id: string;
  type: string;
  businessObject?: { $type: string; name?: string; get: (key: string) => unknown };
}
interface Picked { id: string; type: string; name: string; service: string }

const TASK_TYPES = ["bpmn:Task", "bpmn:ServiceTask", "bpmn:UserTask"];
const typeLabel = (t: string) => t.replace(/^bpmn:/, "").replace(/([a-z])([A-Z])/g, "$1 $2");

const describe = (el: El | undefined): Picked | null => {
  const bo = el?.businessObject;
  if (!el || !bo || el.type === "label") return null;
  return { id: el.id, type: bo.$type, name: bo.name ?? "", service: String(bo.get("cq:service") ?? "") };
};

const CONFLICT = "Someone saved this workflow after you opened it. Download your copy, then reload to see theirs.";

// ---------------------------------------------------------------- component
export function BpmnDesigner({
  id, canEdit, role, onRenamed, onDeleted,
}: {
  id: string;
  canEdit: boolean;
  role?: string;
  onRenamed: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<Modeler | null>(null);
  const versionRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [report, setReport] = useState<BpmnReport | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [versions, setVersions] = useState<WorkflowVersionSummary[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const service = <T,>(name: string): T => modelerRef.current!.get(name) as T;

  const exportXml = useCallback(async (): Promise<string | null> => {
    const modeler = modelerRef.current;
    if (!modeler) return null;
    const { xml } = await modeler.saveXML({ format: true });
    return xml ?? null;
  }, []);

  // Editors check the diagram as drawn; viewers see the check of what is saved.
  const revalidate = useCallback(async () => {
    try {
      if (canEdit) {
        const xml = await exportXml();
        if (xml != null) setReport(await api.validateWorkflowXml(xml));
      } else {
        setReport(await api.validateWorkflow(id));
      }
      setCheckError(null);
    } catch (e) {
      setReport(null);
      setCheckError(e instanceof ApiError ? e.friendly : e instanceof Error ? e.message : "unknown error");
    }
  }, [canEdit, id, exportXml]);
  const revalidateRef = useRef(revalidate);
  useEffect(() => {
    revalidateRef.current = revalidate;
  }, [revalidate]);

  // Mount the modeler and load the diagram whenever the selected id changes.
  useEffect(() => {
    let disposed = false;
    let modeler: Modeler | null = null;
    setStatus("loading");
    setDirty(false);
    setPicked(null);
    setReport(null);
    setVersions(null);

    (async () => {
      const { default: BpmnModeler } = await import("bpmn-js/lib/Modeler");
      if (disposed || !containerRef.current) return;
      modeler = new BpmnModeler({
        container: containerRef.current,
        moddleExtensions: { cq: CQ_MODDLE },
        additionalModules: [cqRestrictions],
      });
      modelerRef.current = modeler;
      try {
        const wf = await api.getWorkflow(id);
        if (disposed) return;
        versionRef.current = wf.version;
        setName(wf.name);
        await modeler.importXML(wf.xml);
        (modeler.get("canvas") as { zoom: (m: string) => void }).zoom("fit-viewport");
        const bus = modeler.get("eventBus") as { on: (e: string, cb: (ev: never) => void) => void };
        bus.on("commandStack.changed", () => {
          if (disposed) return;
          setDirty(true);
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => void revalidateRef.current(), 600);
        });
        bus.on("selection.changed", (ev: { newSelection: El[] }) => {
          if (!disposed) setPicked(describe(ev.newSelection.length === 1 ? ev.newSelection[0] : undefined));
        });
        bus.on("element.changed", (ev: { element: El }) => {
          if (!disposed) setPicked((cur) => (cur && cur.id === ev.element.id ? describe(ev.element) : cur));
        });
        if (!disposed) {
          setStatus("ready");
          void revalidateRef.current();
        }
      } catch {
        if (!disposed) setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(timerRef.current);
      modeler?.destroy();
      modelerRef.current = null;
    };
  }, [id]);

  // ---------------------------------------------------------------- step panel actions
  const elementById = (elId: string) => service<{ get: (id: string) => El | undefined }>("elementRegistry").get(elId);
  type Modeling = { updateLabel: (el: El, v: string) => void; updateProperties: (el: El, p: Record<string, unknown>) => void };

  const renameStep = (value: string) => {
    const el = picked && elementById(picked.id);
    if (el && value.trim() !== picked.name) service<Modeling>("modeling").updateLabel(el, value.trim());
  };

  /** Bind a service, switching the task to the kind that service needs (user task for people). */
  const bind = (serviceId: string) => {
    let el = picked && elementById(picked.id);
    if (!el) return;
    const svc = serviceId ? serviceById(serviceId) : undefined;
    if (svc) {
      const want = svc.kind === "human" ? "bpmn:UserTask" : "bpmn:ServiceTask";
      if (el.businessObject?.$type !== want) {
        el = service<{ replaceElement: (el: El, t: { type: string }) => El }>("bpmnReplace").replaceElement(el, { type: want });
      }
    }
    service<Modeling>("modeling").updateProperties(el, { "cq:service": serviceId || undefined });
    service<{ select: (el: El) => void }>("selection").select(el);
    setPicked(describe(el));
  };

  const focus = (p: BpmnProblem) => {
    const el = p.element_id && modelerRef.current ? elementById(p.element_id) : undefined;
    if (!el) return;
    service<{ select: (el: El) => void }>("selection").select(el);
    service<{ scrollToElement: (el: El) => void }>("canvas").scrollToElement(el);
  };

  // ---------------------------------------------------------------- toolbar actions
  const save = async () => {
    setSaving(true);
    try {
      const xml = await exportXml();
      if (xml == null) throw new Error("nothing to save");
      const wf = await api.saveWorkflow(id, xml, versionRef.current);
      versionRef.current = wf.version;
      setVersions(null);
      setDirty(false);
      toast("success", "Workflow saved");
    } catch (e) {
      toast("error", e instanceof ApiError ? (e.status === 409 ? CONFLICT : e.friendly) : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const renameWorkflow = async () => {
    const next = window.prompt("Workflow name", name)?.trim();
    if (!next || next === name) return;
    try {
      const wf = await api.renameWorkflow(id, next, versionRef.current);
      versionRef.current = wf.version;
      setVersions(null);
      setName(wf.name);
      onRenamed();
      toast("success", "Workflow renamed");
    } catch (e) {
      toast("error", e instanceof ApiError ? (e.status === 409 ? CONFLICT : e.friendly) : "Rename failed");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${name}" and its version history?`)) return;
    try {
      await api.deleteWorkflow(id);
      toast("success", "Workflow deleted");
      onDeleted();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Delete failed");
    }
  };

  const toggleHistory = async () => {
    setHistoryOpen((open) => !open);
    if (versions === null) {
      try {
        setVersions(await api.listWorkflowVersions(id));
      } catch {
        setVersions([]);
      }
    }
  };

  const openVersion = async (version: number) => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    try {
      const old = await api.getWorkflowVersion(id, version);
      await modeler.importXML(old.xml);
      (modeler.get("canvas") as { zoom: (m: string) => void }).zoom("fit-viewport");
      setHistoryOpen(false);
      setPicked(null);
      setDirty(true);
      void revalidateRef.current();
      toast("success", canEdit ? `Opened version ${version}. Save to restore it.` : `Showing version ${version}.`);
    } catch {
      toast("error", "Could not open that version");
    }
  };

  const download = async () => {
    const xml = await exportXml();
    if (xml == null) return;
    const blob = new Blob([xml], { type: "application/bpmn+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.bpmn`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const canDelete = !!role && (RESOURCES.workflows.roles.delete as readonly string[]).includes(role);
  const boundService = picked?.service ? serviceById(picked.service) : undefined;
  const secondary = "rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-base font-semibold text-neutral-800">{name}</h2>
        {canEdit && (
          <button
            onClick={save}
            disabled={saving || status !== "ready" || !dirty}
            className="rounded-md bg-[color:var(--cq-iris)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--cq-violet)] disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        )}
        {canEdit && (
          <button onClick={renameWorkflow} disabled={status !== "ready"} className={secondary}>
            Rename
          </button>
        )}
        <div className="relative">
          <button onClick={toggleHistory} disabled={status !== "ready"} className={secondary} aria-expanded={historyOpen}>
            History
          </button>
          {historyOpen && (
            <div className="absolute left-0 z-20 mt-1 w-72 rounded-md border border-neutral-200 bg-white p-1 shadow-lg">
              {versions === null ? (
                <p className="px-3 py-2 text-sm text-neutral-400">Loading…</p>
              ) : versions.length === 0 ? (
                <p className="px-3 py-2 text-sm text-neutral-400">No earlier versions yet.</p>
              ) : (
                versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => openVersion(v.version)}
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    Version {v.version} · {v.name}
                    <span className="block text-xs text-neutral-400">
                      {v.created_at}
                      {v.saved_by ? ` · replaced by ${v.saved_by}` : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <button onClick={download} disabled={status !== "ready"} className={secondary}>
          Download .bpmn
        </button>
        {canDelete && (
          <button onClick={remove} disabled={status !== "ready"} className="rounded-md px-3 py-2 text-sm text-red-700 hover:bg-red-50">
            Delete
          </button>
        )}
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
        {status === "error" && <span className="text-xs text-red-600">Failed to load diagram.</span>}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white">
          {status === "loading" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-neutral-400">
              Loading diagram…
            </div>
          )}
          <div ref={containerRef} className="h-[72vh] w-full" />
        </div>

        <aside className="w-full shrink-0 space-y-3 lg:w-72">
          <section className="rounded-lg border border-neutral-200 bg-white p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Step</h3>
            {!picked ? (
              <p className="mt-2 text-sm text-neutral-400">Select a task to bind it to a CharmQuark service.</p>
            ) : (
              <div className="mt-2 space-y-3">
                <p className="text-xs text-neutral-500">
                  {typeLabel(picked.type)} · {picked.id}
                </p>
                <label className="block text-xs font-medium text-neutral-600">
                  Name
                  <input
                    key={`${picked.id}:${picked.name}`}
                    defaultValue={picked.name}
                    disabled={!canEdit}
                    onBlur={(e) => renameStep(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm font-normal text-neutral-800 disabled:bg-neutral-50"
                  />
                </label>
                {TASK_TYPES.includes(picked.type) && (
                  <label className="block text-xs font-medium text-neutral-600">
                    Service
                    <select
                      value={picked.service}
                      disabled={!canEdit}
                      onChange={(e) => bind(e.target.value)}
                      className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm font-normal text-neutral-800 disabled:bg-neutral-50"
                    >
                      <option value="">Not bound</option>
                      <optgroup label="The system does it (service task)">
                        {WORKFLOW_SERVICES.filter((s) => s.kind === "system").map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="A person does it (user task)">
                        {WORKFLOW_SERVICES.filter((s) => s.kind === "human").map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </optgroup>
                      {picked.service && !boundService && <option value={picked.service}>{picked.service} (unknown)</option>}
                    </select>
                  </label>
                )}
                {boundService && (
                  <p className="text-xs text-neutral-500">
                    {boundService.description}
                    {boundService.api && <code className="mt-1 block text-[11px] text-neutral-400">{boundService.api}</code>}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Checks</h3>
            {checkError ? (
              <p className="mt-2 text-sm text-red-700">Could not check the diagram: {checkError}</p>
            ) : !report ? (
              <p className="mt-2 text-sm text-neutral-400">Checking…</p>
            ) : report.errors.length + report.warnings.length === 0 ? (
              <p className="mt-2 text-sm text-emerald-700">
                No problems. {report.bindings.length} step{report.bindings.length === 1 ? "" : "s"} bound to services.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {[...report.errors.map((p) => ({ p, error: true })), ...report.warnings.map((p) => ({ p, error: false }))].map(({ p, error }, i) => (
                  <li key={`${p.code}-${p.element_id ?? ""}-${i}`}>
                    <button
                      onClick={() => focus(p)}
                      className={`text-left text-sm ${error ? "text-red-700" : "text-amber-700"} ${p.element_id ? "hover:underline" : "cursor-default"}`}
                    >
                      {error ? "Error: " : "Warning: "}
                      {p.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
