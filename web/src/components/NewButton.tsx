"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { validateField, trimValue } from "@/lib/validation";
import { useToast } from "./Toast";

export interface Field {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
  /** Numeric lower bound (inclusive); only applies to number fields. */
  min?: number;
  /** Numeric upper bound (inclusive); only applies to number fields. */
  max?: number;
  default?: string | number | boolean;
}

type Values = Record<string, string | number | boolean>;

function errorFor(f: Field, value: string | number | boolean): string | null {
  return validateField(value, {
    required: f.required,
    numeric: f.type === "number",
    min: f.min,
    max: f.max,
    label: f.label,
  });
}

/** A role-gated "New …" button that opens a modal form and submits it. Hidden when `hidden`. */
export function NewButton({
  label,
  title,
  fields,
  onCreate,
  onDone,
  hidden,
}: {
  label: string;
  title: string;
  fields: Field[];
  onCreate: (values: Values) => Promise<unknown>;
  onDone: () => void;
  hidden?: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.default ?? (f.type === "checkbox" ? false : "")])),
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  if (hidden) return null;

  const errors = Object.fromEntries(
    fields.map((f) => [f.name, errorFor(f, values[f.name])] as const),
  );
  const isValid = Object.values(errors).every((e) => e === null);

  const reset = () => {
    setValues(Object.fromEntries(fields.map((f) => [f.name, f.default ?? (f.type === "checkbox" ? false : "")])));
    setTouched({});
  };

  const submit = async () => {
    if (!isValid) {
      setTouched(Object.fromEntries(fields.map((f) => [f.name, true])));
      return;
    }
    setBusy(true);
    try {
      const trimmed = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, trimValue(v)]),
      ) as Values;
      await onCreate(trimmed);
      toast("success", `${title} created`);
      setOpen(false);
      reset();
      onDone();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="cq-btn-primary rounded-lg px-3 py-1.5 text-sm font-medium"
      >
        + {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
          <div
            className="w-[380px] rounded-xl border border-neutral-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-base font-semibold">{title}</h2>
            <div className="flex flex-col gap-3">
              {fields.map((f) => {
                const err = touched[f.name] ? errors[f.name] : null;
                const markTouched = () => setTouched((t) => ({ ...t, [f.name]: true }));
                return (
                <label key={f.name} className="text-sm">
                  <span className="mb-1 block text-neutral-500">{f.label}</span>
                  {f.type === "select" ? (
                    <select
                      value={String(values[f.name] ?? "")}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      onBlur={markTouched}
                      className="w-full rounded border border-neutral-300 px-2 py-1.5"
                    >
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(values[f.name])}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))}
                      className="h-4 w-4"
                    />
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      min={f.type === "number" ? f.min : undefined}
                      max={f.type === "number" ? f.max : undefined}
                      value={String(values[f.name] ?? "")}
                      onBlur={markTouched}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          [f.name]:
                            f.type === "number"
                              ? e.target.value === ""
                                ? ""
                                : Number(e.target.value)
                              : e.target.value,
                        }))
                      }
                      className={`w-full rounded border px-2 py-1.5 ${
                        err ? "border-red-400" : "border-neutral-300"
                      }`}
                    />
                  )}
                  {err && <span className="mt-1 block text-xs text-red-600">{err}</span>}
                </label>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy || !isValid}
                className="cq-btn-primary rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
