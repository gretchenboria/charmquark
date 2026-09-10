"use client";

// Robot Operator-facing editor for a task's execution instructions (.txt / JSON template).
// Saving PUTs a new immutable version; the version history lets you preview, restore,
// and prune earlier revisions. PM + Robot Operator may edit; everyone else sees read-only
// content. JSON content is pretty-printed for display and validated before save.
import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import type { InstructionFormat, TaskInstructions } from "@/lib/types";
import { useToast } from "@/components/Toast";

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

// Pretty-print JSON with 2-space indent; returns the input unchanged if it does
// not parse (so partially-typed content is never silently mangled).
const prettyJson = (raw: string): string => {
  const s = raw.trim();
  if (!s) return raw;
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return raw;
  }
};

// Validate that a string parses as JSON. Empty content is treated as valid
// (a blank template is allowed). Returns an error message or null.
const jsonError = (raw: string): string | null => {
  const s = raw.trim();
  if (!s) return null;
  try {
    JSON.parse(s);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid JSON";
  }
};

export function TaskInstructionsPanel({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<TaskInstructions | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [format, setFormat] = useState<InstructionFormat>("txt");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // inline JSON validation error surfaced under the editor (null = no error)
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  // preview of a historical version (null = viewing current)
  const [preview, setPreview] = useState<{ version_number: number; content: string } | null>(null);

  const load = useCallback(() => {
    api
      .getInstructions(taskId)
      .then((d) => {
        setData(d);
        setContent(d.format === "json" ? prettyJson(d.content) : d.content);
        setFormat(d.format);
        setPreview(null);
        setJsonErr(null);
      })
      .catch(() => setErr("Failed to load instructions."));
  }, [taskId]);
  useEffect(load, [load]);

  // Shared save path used by both the manual "Save version" button and the
  // one-click restore action. Validates JSON before hitting the server.
  const persist = useCallback(
    async (payload: { content: string; format: InstructionFormat; notes?: string }, okMsg: string) => {
      if (payload.format === "json") {
        const problem = jsonError(payload.content);
        if (problem) {
          setJsonErr(problem);
          toast("error", `Invalid JSON — not saved: ${problem}`);
          return false;
        }
      }
      setSaving(true);
      try {
        const d = await api.saveInstructions(taskId, {
          content: payload.content,
          format: payload.format,
          notes: payload.notes?.trim() || undefined,
        });
        setData(d);
        setContent(d.format === "json" ? prettyJson(d.content) : d.content);
        setFormat(d.format);
        setNotes("");
        setPreview(null);
        setJsonErr(null);
        toast("success", okMsg);
        return true;
      } catch (e) {
        toast("error", e instanceof ApiError ? e.friendly : "Save failed");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [taskId, toast],
  );

  const save = () => persist({ content, format, notes }, "Instructions saved (new version)");

  const formatContent = () => {
    const problem = jsonError(content);
    if (problem) {
      setJsonErr(problem);
      toast("error", `Invalid JSON: ${problem}`);
      return;
    }
    setContent(prettyJson(content));
    setJsonErr(null);
  };

  const download = () => {
    const ext = format === "json" ? "json" : "txt";
    const mime = format === "json" ? "application/json" : "text/plain";
    const body = format === "json" ? prettyJson(content) : content;
    const blob = new Blob([body], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${taskId}-instructions.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const showVersion = async (versionId: string) => {
    try {
      const v = await api.getInstructionVersion(taskId, versionId);
      setPreview({
        version_number: v.version_number,
        content: format === "json" ? prettyJson(v.content) : v.content,
      });
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not load version");
    }
  };

  // Load a historical version's content and save it as a new current version.
  const restoreVersion = async (versionId: string, versionNumber: number) => {
    try {
      const v = await api.getInstructionVersion(taskId, versionId);
      await persist(
        { content: v.content, format, notes: `Restored from v${versionNumber}` },
        `Restored v${versionNumber} as new current version`,
      );
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Restore failed");
    }
  };

  const removeVersion = async (versionId: string) => {
    try {
      await api.deleteInstructionVersion(taskId, versionId);
      toast("success", "Version deleted");
      load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Delete failed");
    }
  };

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!data) return <p className="text-sm text-neutral-400">Loading…</p>;

  const preCls =
    "max-h-80 overflow-auto whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-800";

  return (
    <div className="space-y-4">
      {/* current content (read-only when the user cannot edit) */}
      {!canEdit && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              {data.current_version
                ? `Current — v${data.current_version} · ${data.format}`
                : "Current"}
            </span>
            {data.content && (
              <button
                onClick={download}
                className="rounded border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50"
              >
                Download
              </button>
            )}
          </div>
          {data.content ? (
            <pre className={preCls}>
              {data.format === "json" ? prettyJson(data.content) : data.content}
            </pre>
          ) : (
            <p className="text-sm text-neutral-400">No instructions yet.</p>
          )}
        </div>
      )}

      {canEdit && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              {data.current_version
                ? `Editing — current v${data.current_version} · ${data.format}`
                : "No instructions yet."}
            </span>
            <label className="flex items-center gap-1 text-xs text-neutral-500">
              Format
              <select
                className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs"
                value={format}
                onChange={(e) => {
                  const next = e.target.value as InstructionFormat;
                  setFormat(next);
                  setJsonErr(next === "json" ? jsonError(content) : null);
                }}
              >
                <option value="txt">txt</option>
                <option value="json">json</option>
              </select>
            </label>
          </div>
          <textarea
            className="h-56 w-full rounded border border-neutral-300 p-3 font-mono text-xs text-neutral-800"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (jsonErr) setJsonErr(format === "json" ? jsonError(e.target.value) : null);
            }}
            placeholder="No instructions yet."
            spellCheck={false}
          />
          {jsonErr && <p className="mt-1 text-xs text-red-600">Invalid JSON: {jsonErr}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Change notes (optional)"
            />
            {format === "json" && (
              <button
                onClick={formatContent}
                disabled={saving}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
              >
                Format JSON
              </button>
            )}
            <button
              onClick={download}
              disabled={saving}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              Download
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save version"}
            </button>
          </div>
        </div>
      )}

      {/* version history */}
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Version history
        </div>
        {data.versions.length === 0 ? (
          <p className="text-sm text-neutral-400">No versions yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded border border-neutral-200 bg-white">
            {data.versions.map((v) => {
              const isCurrent = v.version_number === data.current_version;
              return (
                <li
                  key={v.version_id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <button
                    onClick={() => showVersion(v.version_id)}
                    className="min-w-0 flex-1 text-left hover:underline"
                  >
                    <span className="font-medium text-blue-700">v{v.version_number}</span>
                    {isCurrent && (
                      <span className="ml-2 rounded bg-teal-100 px-1.5 py-0.5 text-xs font-medium text-teal-700">
                        current
                      </span>
                    )}
                    {v.notes && <span className="ml-2 text-neutral-600">{v.notes}</span>}
                    <span className="ml-2 text-xs text-neutral-400">
                      {v.uploaded_by ?? "unknown"} · {fmtWhen(v.created_at)}
                    </span>
                  </button>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      {!isCurrent && (
                        <button
                          onClick={() => restoreVersion(v.version_id, v.version_number)}
                          disabled={saving}
                          className="rounded border border-neutral-200 px-2 py-0.5 text-xs text-teal-700 hover:bg-neutral-50 disabled:opacity-50"
                        >
                          Restore
                        </button>
                      )}
                      <button
                        onClick={() => removeVersion(v.version_id)}
                        disabled={saving}
                        className="rounded border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* historical preview */}
      {preview && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-neutral-400">Previewing v{preview.version_number}</span>
            <button
              onClick={() => setPreview(null)}
              className="text-xs text-neutral-500 hover:text-neutral-800"
            >
              Close preview
            </button>
          </div>
          <pre className={preCls}>{preview.content}</pre>
        </div>
      )}
    </div>
  );
}
