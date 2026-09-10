"use client";

// Workflow designer — pick one of the BPMN diagrams (Docs/workflows/*.bpmn) and edit it
// on a full bpmn-js canvas. Edits save back to the source file.
import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { BpmnDesigner } from "@/components/BpmnDesigner";
import { canCreate, canUpdate } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import { useToast } from "@/components/Toast";
import type { WorkflowSummary } from "@/lib/types";

export default function WorkflowDesignerPage() {
  const user = useUser();
  const canEdit = canUpdate(user?.role);
  const canCreateWf = canCreate(user?.role);
  const toast = useToast();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .listWorkflows()
      .then((ws) => {
        setWorkflows(ws);
        setSelected((cur) => cur ?? ws[0]?.id ?? null);
      })
      .catch(() => setErr("Failed to load workflows."));
  }, []);

  useEffect(load, [load]);

  const createNew = async () => {
    const name = window.prompt("New workflow name");
    if (!name || !name.trim()) return;
    try {
      const wf = await api.createWorkflow(name.trim());
      const ws = await api.listWorkflows();
      setWorkflows(ws);
      setSelected(wf.id);
      toast("success", "Workflow created");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not create workflow");
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Workflow designer</h1>
          <p className="text-sm text-neutral-500">Edit the BPMN 2.0 process diagrams. Changes save to the source file.</p>
        </div>
        <div className="flex items-center gap-3">
          {canCreateWf && (
            <button onClick={createNew} className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
              New workflow
            </button>
          )}
          <a href="/workflows" className="text-sm font-medium text-blue-700 hover:underline">
            ← Guided workflows
          </a>
        </div>
      </div>

      {err ? (
        <p className="text-sm text-red-600">{err}</p>
      ) : workflows.length === 0 ? (
        <p className="text-sm text-neutral-400">No workflow diagrams yet. Use New workflow to start one.</p>
      ) : (
        <div className="flex gap-4">
          <nav className="w-56 shrink-0 space-y-1">
            {workflows.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelected(w.id)}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                  selected === w.id ? "bg-teal-50 font-medium text-teal-800" : "text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {w.name}
                <span className="block truncate text-xs text-neutral-400">{w.id}</span>
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1">
            {selected && <BpmnDesigner key={selected} id={selected} canEdit={canEdit} />}
          </div>
        </div>
      )}
    </div>
  );
}
