"use client";

// Vault files attached to a run (recordings, documents). Upload reads the file in the
// browser and sends it base64-encoded; storage is handled by the backend object store
// (local filesystem until R2 object storage is wired up). List / download / delete included.
import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/lib/api";
import type { CharmQuarkDocument } from "@/lib/types";
import { useToast } from "@/components/Toast";

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(",") + 1)); // strip "data:...;base64,"
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function humanSize(n?: number): string {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function RunFiles({ runId, canEdit }: { runId: string; canEdit: boolean }) {
  const toast = useToast();
  const [docs, setDocs] = useState<CharmQuarkDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api
      .listDocuments({ linked_entity_type: "run", linked_entity_id: runId })
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [runId]);
  useEffect(load, [load]);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const content_b64 = await fileToB64(file);
      await api.uploadDocument({
        filename: file.name,
        content_b64,
        mime_type: file.type || "application/octet-stream",
        vault_category: file.type.startsWith("video") ? "MEDIA" : "OTHER",
        linked_entity_type: "run",
        linked_entity_id: runId,
      });
      toast("success", `Uploaded ${file.name}`);
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (id: string, name: string) => {
    try {
      await api.deleteDocument(id);
      toast("success", `Deleted ${name}`);
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Delete failed");
    }
  };

  return (
    <div>
      {canEdit && (
        <div className="mb-3">
          <input
            ref={inputRef}
            type="file"
            disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            className="text-xs text-neutral-500 file:mr-3 file:rounded file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-700"
          />
          {busy && <span className="ml-2 text-xs text-neutral-400">uploading…</span>}
        </div>
      )}
      {docs.length === 0 ? (
        <p className="text-sm text-neutral-400">No files attached to this run yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <a
                href={api.documentContentUrl(d.id)}
                className="min-w-0 flex-1 truncate text-blue-700 hover:underline"
                download={d.filename}
              >
                {d.filename}
              </a>
              <span className="shrink-0 text-xs text-neutral-400">{d.vault_category.toLowerCase()}</span>
              <span className="shrink-0 text-xs text-neutral-400">{humanSize(d.doc_metadata?.[0]?.size_bytes)}</span>
              {canEdit && (
                <button
                  onClick={() => remove(d.id, d.filename)}
                  className="shrink-0 text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
