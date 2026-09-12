"use client";

// Workflow designer: pick a BPMN workflow and edit it on a bpmn-js canvas bound to the
// CharmQuark service catalogue. A new workflow starts blank, from one of the guided
// workflows, or from a description the deployment's model turns into a diagram.
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WORKFLOW_TEMPLATES } from "@contracts";

import { api, ApiError } from "@/lib/api";
import { BpmnDesigner } from "@/components/BpmnDesigner";
import { canCreate, canUpdate } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import { useToast } from "@/components/Toast";
import type { WorkflowSummary } from "@/lib/types";

export default function WorkflowDesignerPage() {
  return (
    <Suspense fallback={null}>
      <Designer />
    </Suspense>
  );
}

function Designer() {
  const user = useUser();
  const canEdit = canUpdate(user?.role);
  const canCreateWf = canCreate(user?.role);
  const initialId = useSearchParams().get("id");
  const [selected, setSelected] = useState<string | null>(initialId);
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Selection is state, mirrored into ?id= for links. A router transition here could
  // land after a newer selection and undo it.
  const select = useCallback((wfId: string | null) => {
    setSelected(wfId);
    window.history.replaceState(null, "", wfId ? `/workflows/designer?id=${encodeURIComponent(wfId)}` : "/workflows/designer");
  }, []);

  const load = useCallback(() => {
    api
      .listWorkflows()
      .then(setWorkflows)
      .catch(() => setErr("Failed to load workflows."));
  }, []);

  useEffect(load, [load]);

  // Open the first workflow when none is chosen (or the chosen one was deleted).
  useEffect(() => {
    if (!workflows) return;
    if (!selected || !workflows.some((w) => w.id === selected)) {
      const first = workflows[0]?.id ?? null;
      if (first !== selected) select(first);
    }
  }, [workflows, selected, select]);

  // Select only once the list includes the new workflow; otherwise the effect above
  // sees an unknown id and falls back to the first workflow.
  const created = async (wfId: string) => {
    setCreating(false);
    try {
      setWorkflows(await api.listWorkflows());
    } catch {
      setErr("Failed to load workflows.");
    }
    select(wfId);
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-800">Fleet & DataOps Pipeline Designer</h1>
          <p className="mt-1 text-sm text-neutral-600 max-w-3xl">
            This is your <strong>Command Center</strong> for orchestrating all automated fleet logic. 
            Draw BPMN 2.0 workflows to automate <strong>hardware calibration routines, safety approval processes, autonomous robotic data collection, QA validation steps, and ML dataset extraction pipelines</strong>. Bind each visual task directly to a CharmQuark backend service.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canCreateWf && (
            <button
              onClick={() => setCreating((c) => !c)}
              className="rounded-md bg-[color:var(--cq-iris)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[color:var(--cq-violet)]"
            >
              New workflow
            </button>
          )}
          <a href="/workflows" className="text-sm font-medium text-blue-700 hover:underline">
            ← Guided workflows
          </a>
        </div>
      </div>

      {creating && <NewWorkflowPanel onCreated={created} onCancel={() => setCreating(false)} />}

      {err ? (
        <p className="text-sm text-red-600">{err}</p>
      ) : workflows === null ? (
        <p className="text-sm text-neutral-400">Loading workflows…</p>
      ) : workflows.length === 0 ? (
        <p className="text-sm text-neutral-400">No workflow diagrams yet. Use New workflow to start one.</p>
      ) : (
        <div className="flex gap-4">
          <nav className="w-56 shrink-0 space-y-1">
            {workflows.map((w) => (
              <button
                key={w.id}
                onClick={() => select(w.id)}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                  selected === w.id ? "bg-violet-50 font-medium text-[color:var(--cq-plum)]" : "text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {w.name}
                <span className="block truncate text-xs text-neutral-400">{w.id}</span>
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1">
            {selected && workflows.some((w) => w.id === selected) && (
              <BpmnDesigner
                key={selected}
                id={selected}
                canEdit={canEdit}
                role={user?.role}
                onRenamed={load}
                onDeleted={() => {
                  select(null);
                  load();
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type Mode = "template" | "describe" | "blank";

function NewWorkflowPanel({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("template");
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(WORKFLOW_TEMPLATES[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const trimmed = name.trim();
      if (mode === "blank") {
        if (!trimmed) throw new Error("Give the workflow a name.");
        onCreated((await api.createWorkflow(trimmed)).id);
      } else if (mode === "template") {
        const t = WORKFLOW_TEMPLATES.find((x) => x.id === templateId);
        if (!t) throw new Error("Pick a guided workflow.");
        onCreated((await api.generateWorkflow({ graph: t.graph, name: trimmed || t.name })).workflow.id);
      } else {
        if (!description.trim()) throw new Error("Describe what the workflow should do.");
        const out = await api.generateWorkflow({ description: description.trim(), ...(trimmed ? { name: trimmed } : {}) });
        if (out.report.warnings.length) toast("success", `Generated. Review ${out.report.warnings.length} warning(s) under Checks.`);
        onCreated(out.workflow.id);
        return;
      }
      toast("success", "Workflow created");
    } catch (err) {
      setError(err instanceof ApiError ? err.friendly : err instanceof Error ? err.message : "Could not create the workflow");
    } finally {
      setBusy(false);
    }
  };

  const choice = (value: Mode, label: string) => (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <input type="radio" name="new-workflow-mode" checked={mode === value} onChange={() => setMode(value)} />
      {label}
    </label>
  );

  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap gap-4">
        {choice("template", "From a guided workflow")}
        {choice("describe", "Describe it (AI)")}
        {choice("blank", "Blank")}
      </div>
      {mode === "template" && (
        <label className="block text-xs font-medium text-neutral-600">
          Guided workflow
          <select
            aria-label="Guided workflow"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="mt-1 block w-full max-w-md rounded-md border border-neutral-300 px-2 py-1.5 text-sm font-normal"
          >
            {WORKFLOW_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}: {t.description}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode === "describe" && (
        <label className="block text-xs font-medium text-neutral-600">
          What should the workflow do?
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="e.g. When a run finishes, run the QA autocheck; if it fails a person reviews it; then export to Roboflow."
            className="mt-1 block w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm font-normal"
          />
          <span className="mt-1 block font-normal text-neutral-400">
            The deployment&apos;s model drafts a diagram bound to CharmQuark services. Review it before you rely on it.
          </span>
        </label>
      )}
      <label className="block text-xs font-medium text-neutral-600">
        Name{mode === "blank" ? "" : " (optional)"}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full max-w-md rounded-md border border-neutral-300 px-2 py-1.5 text-sm font-normal"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[color:var(--cq-iris)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[color:var(--cq-violet)] disabled:bg-neutral-300"
        >
          {busy ? (mode === "describe" ? "Generating…" : "Creating…") : "Create"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
          Cancel
        </button>
      </div>
    </form>
  );
}
