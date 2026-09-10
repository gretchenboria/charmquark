"use client";

import type { ReactNode } from "react";

/** Small shared UI atoms for workflow bodies — keeps each workflow file lean and the
 *  look consistent with the rest of the app (flat, no shadow-heavy cards). */

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-800">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

export function selectClass() {
  return "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";
}

export function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-md bg-[color:var(--cq-iris)] py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** A readiness/issue line — green when clear, red with the reason when not. */
export function IssueLine({ label, reason }: { label: string; reason?: string }) {
  const ok = !reason;
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
      <span className="text-neutral-700">
        <span className="font-medium">{label}</span>
        {reason ? <span className="text-red-600"> — {reason}</span> : <span className="text-green-600"> — ready</span>}
      </span>
    </div>
  );
}

export const RISK_COLOR: Record<string, string> = {
  LOW: "bg-green-50 text-green-700",
  POTENTIAL: "bg-amber-50 text-amber-700",
  HIGH: "bg-red-50 text-red-700",
  UNKNOWN: "bg-neutral-100 text-neutral-500",
};
