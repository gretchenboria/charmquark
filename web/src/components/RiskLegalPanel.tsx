"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { TaskDetail } from "@/lib/types";
import { isLegalReviewer, canUpdate, type Role } from "@/lib/session";
import { useToast } from "./Toast";

const RISK_COLOR: Record<string, string> = {
  LOW: "bg-green-50 text-green-700",
  POTENTIAL: "bg-amber-50 text-amber-700",
  HIGH: "bg-red-50 text-red-700",
  UNKNOWN: "bg-neutral-100 text-neutral-500",
};

/** Risk calculator + legal-review panel for a task.
 *  - anyone who can update runs the risk calculator (assess)
 *  - if flagged (PENDING legal), a Fleet Lead approves/holds and can email legal via the default mail client */
export function RiskLegalPanel({
  task,
  role,
  onChanged,
}: {
  task: TaskDetail;
  role: Role | undefined;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [rationale, setRationale] = useState<string | null>(null);
  const [legalEmail, setLegalEmail] = useState("");

  const assess = async () => {
    try {
      const r = await api.assessRisk(task.id);
      setRationale(`${r.risk_level}: ${r.rationale}`);
      toast(r.needs_legal_review ? "info" : "success", `Risk assessed: ${r.risk_level}`);
      onChanged();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Assess failed");
    }
  };

  const verdict = async (approved: boolean) => {
    try {
      await api.legalReview(task.id, approved);
      toast("success", approved ? "Legal approved" : "Kept on hold");
      onChanged();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Legal review failed");
    }
  };

  const mailto = () => {
    const to = encodeURIComponent(legalEmail.trim());
    const subject = encodeURIComponent(`Legal review needed: ${task.task_code} — ${task.name}`);
    const body = encodeURIComponent(
      `Task ${task.task_code} (${task.name}) is flagged ${task.risk_level} and needs legal review.\n\n` +
        `Please advise on approval.\n`,
    );
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  };

  const flagged = task.legal_approval === "PENDING";
  return (
    <div className="rounded-xl bg-neutral-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_COLOR[task.risk_level] ?? ""}`}>
          Risk: {task.risk_level}
        </span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          Legal: {task.legal_approval}
        </span>
        {canUpdate(role) && (
          <button onClick={assess} className="ml-auto rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-white">
            Run risk calculator
          </button>
        )}
      </div>

      {rationale && <p className="mb-3 text-xs text-neutral-500">{rationale}</p>}

      {flagged && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-medium text-amber-800">Pending legal review</div>
          {isLegalReviewer(role) ? (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={legalEmail}
                  onChange={(e) => setLegalEmail(e.target.value)}
                  placeholder="legal-team@…"
                  className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
                />
                <button onClick={mailto} disabled={!legalEmail.trim()} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-white disabled:opacity-40">
                  Email legal
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => verdict(true)} className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">
                  Approve
                </button>
                <button onClick={() => verdict(false)} className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-white">
                  Keep on hold
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-xs text-amber-700">Only a Fleet Lead can give the legal verdict.</p>
          )}
        </div>
      )}
    </div>
  );
}
