"use client";

// BPMN 2.0 designer. Loads a diagram from the backend, mounts a full bpmn-js Modeler
// (palette, context pad, properties via double-click), and saves the edited XML back to
// Docs/workflows/<id>.bpmn. bpmn-js touches the DOM, so the library is imported lazily
// inside an effect (never on the server) and torn down on unmount.
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";

import { useEffect, useRef, useState } from "react";
import type Modeler from "bpmn-js/lib/Modeler";

import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

export function BpmnDesigner({ id, canEdit }: { id: string; canEdit: boolean }) {
  const toast = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<Modeler | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Mount the modeler and load the diagram whenever the selected id changes.
  useEffect(() => {
    let disposed = false;
    let modeler: Modeler | null = null;
    setStatus("loading");
    setDirty(false);

    (async () => {
      const { default: BpmnModeler } = await import("bpmn-js/lib/Modeler");
      if (disposed || !containerRef.current) return;
      modeler = new BpmnModeler({ container: containerRef.current });
      modelerRef.current = modeler;
      try {
        const wf = await api.getWorkflow(id);
        await modeler.importXML(wf.xml);
        (modeler.get("canvas") as { zoom: (m: string) => void }).zoom("fit-viewport");
        // Any model change marks the diagram dirty so Save is meaningful.
        (modeler.get("eventBus") as { on: (e: string, cb: () => void) => void }).on(
          "commandStack.changed",
          () => !disposed && setDirty(true),
        );
        if (!disposed) setStatus("ready");
      } catch {
        if (!disposed) setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      modeler?.destroy();
      modelerRef.current = null;
    };
  }, [id]);

  const exportXml = async (): Promise<string | null> => {
    const modeler = modelerRef.current;
    if (!modeler) return null;
    const { xml } = await modeler.saveXML({ format: true });
    return xml ?? null;
  };

  const save = async () => {
    setSaving(true);
    try {
      const xml = await exportXml();
      if (xml == null) throw new Error("nothing to save");
      await api.saveWorkflow(id, xml);
      setDirty(false);
      toast("success", "Workflow saved");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Save failed");
    } finally {
      setSaving(false);
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {canEdit && (
          <button
            onClick={save}
            disabled={saving || status !== "ready" || !dirty}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        )}
        <button
          onClick={download}
          disabled={status !== "ready"}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
        >
          Download .bpmn
        </button>
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
        {status === "error" && <span className="text-xs text-red-600">Failed to load diagram.</span>}
      </div>

      <div className="relative rounded-lg border border-neutral-200 bg-white">
        {status === "loading" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-neutral-400">
            Loading diagram…
          </div>
        )}
        <div ref={containerRef} className="h-[72vh] w-full" />
      </div>
    </div>
  );
}
