"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { isoDate } from "@/lib/dates";
import { canCreate, canUpdate } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type {
  AcceptProposalResult,
  Robot,
  RunProposal,
  Campaign,
  MissionDuration,
  UploadResult,
} from "@/lib/types";
import { Stepper } from "@/components/Stepper";
import { useToast } from "@/components/Toast";

const STEPS = [
  { key: "propose", label: "Build" },
  { key: "review", label: "Review & Accept" },
  { key: "collect", label: "Collect & Record" },
];

const DURATION_STYLE: Record<MissionDuration, { dot: string; label: string }> = {
  LONG: { dot: "bg-red-500", label: "Long" },
  MEDIUM: { dot: "bg-amber-500", label: "Medium" },
  SHORT: { dot: "bg-green-500", label: "Short" },
  UNSPECIFIED: { dot: "bg-neutral-300", label: "Unsized" },
};

function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AutoSchedulePage() {
  const user = useUser();
  const toast = useToast();
  const canBuild = canCreate(user?.role); // generating a proposal creates a run (PM)
  const canDrive = canUpdate(user?.role); // accept/reject/upload (PM + Robot Operator)

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [slotDate, setSlotDate] = useState<string>("");
  const [robots, setRobots] = useState<Robot[]>([]);

  const [proposal, setProposal] = useState<RunProposal | null>(null);
  const [accepted, setAccepted] = useState<AcceptProposalResult | null>(null);
  const [uploaded, setUploaded] = useState<UploadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // accept form
  const [robotId, setRobotId] = useState<string>("");
  const [payload, setPayload] = useState<string>("");
  const [lab, setLab] = useState<string>("");
  // collect step: which proposed missions were completed (checked = kept in CSV)
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  const step = accepted ? "collect" : proposal ? "review" : "propose";

  useEffect(() => {
    api
      .listCampaigns()
      .then((s) => {
        setCampaigns(s);
        if (s.length > 0) setCampaignId((cur) => cur ?? s[0].id);
      })
      .catch(() => setErr("Backend unreachable (start it on :8000)."));
    api.listRobots().then(setRobots).catch(() => undefined);
  }, []);

  const reset = useCallback(() => {
    setProposal(null);
    setAccepted(null);
    setUploaded(null);
    setRobotId("");
    setPayload("");
    setLab("");
    setCompleted({});
    setErr(null);
  }, []);

  const guarded = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof ApiError ? e.friendly : "Something went wrong";
      setErr(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  const build = () =>
    guarded(async () => {
      if (!campaignId) return;
      const p = await api.createProposal({ campaign_id: campaignId, slot_date: slotDate || null });
      setProposal(p);
      setAccepted(null);
      setUploaded(null);
    });

  const reroll = () =>
    guarded(async () => {
      if (!proposal) return;
      const p = await api.rejectProposal(proposal.run_id);
      setProposal(p);
    });

  const accept = () =>
    guarded(async () => {
      if (!proposal) return;
      const res = await api.acceptProposal(proposal.run_id, {
        robot_id: robotId || null,
        payload: payload || null,
        run_lab: lab || null,
      });
      setAccepted(res);
      // default every proposed mission to "completed" — the user unchecks any they dropped
      setCompleted(Object.fromEntries(proposal.missions.map((t) => [t.id, true])));
      toast("success", "Run accepted — CSV ready");
    });

  const record = () =>
    guarded(async () => {
      if (!accepted || !proposal) return;
      // send each completed mission once per scheduled rep, so a mission recorded N times counts N reps
      const completed_mission_ids = proposal.missions
        .filter((t) => completed[t.id])
        .flatMap((t) => Array<string>(Math.max(1, t.reps)).fill(t.id));
      const res = await api.uploadRunCsv(accepted.run.id, { completed_mission_ids });
      setUploaded(res);
      toast("success", "Results recorded");
    });

  const studyName = campaigns.find((s) => s.id === campaignId)?.name ?? "";
  const proposedById = useMemo(
    () => Object.fromEntries((proposal?.missions ?? []).map((t) => [t.id, t])),
    [proposal],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-neutral-200 bg-white px-5 py-3">
        <h1 className="text-lg font-semibold">Auto-Schedule</h1>
        <span className="text-sm text-neutral-500">Build a ~1-hour run automatically</span>
        {!canDrive && (
          <span className="ml-auto rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
            Read-only (your role can’t run scheduling)
          </span>
        )}
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-6">
        <div className="mb-6">
          <Stepper stages={STEPS} current={step} />
        </div>

        {err && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        {/* ---------------------------------------------------------- Step 1: Build */}
        {step === "propose" && (
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-neutral-800">Build a run</h2>
            <p className="mt-1 text-sm text-neutral-500">
              We’ll pick ready-to-collect missions that still need repetitions and pack them to fill a
              run (1 long, or 2 medium, or 4 short missions).
            </p>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-500">Campaign</span>
                <select
                  value={campaignId ?? ""}
                  onChange={(e) => setCampaignId(e.target.value || null)}
                  className="cq-select w-full"
                >
                  {campaigns.length === 0 && <option value="">No campaigns</option>}
                  {campaigns.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-500">Run date (optional)</span>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  className="cq-select w-full"
                />
              </label>
            </div>

            <button
              onClick={build}
              disabled={!canBuild || !campaignId || busy}
              className="mt-5 w-full rounded-md bg-[color:var(--cq-iris)] py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              {busy ? "Building…" : "Generate proposal"}
            </button>
            {!canBuild && (
              <p className="mt-2 text-center text-xs text-neutral-400">Only a PM can generate a proposal.</p>
            )}
          </section>
        )}

        {/* ---------------------------------------------------------- Step 2: Review & Accept */}
        {step === "review" && proposal && (
          <section className="space-y-4">
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-800">Proposed run · {studyName}</h2>
                <FitBadge total={proposal.total_units} budget={proposal.budget} packed={proposal.fully_packed} />
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                {proposal.total_reps} recording{proposal.total_reps === 1 ? "" : "s"} across{" "}
                {proposal.missions.length} mission{proposal.missions.length === 1 ? "" : "s"} · one CSV row per recording
              </p>

              {!proposal.meets_floor && (
                <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Under-filled: fewer than 2 effort units available. You can still accept it, or add
                  more ready missions and re-roll.
                </div>
              )}

              <ul className="mt-3 divide-y divide-neutral-100">
                {proposal.missions.map((t) => {
                  const d = DURATION_STYLE[t.duration_type];
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${d.dot}`} title={d.label} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 truncate text-sm text-neutral-800">
                          <span>
                            <span className="font-mono text-neutral-500">{t.mission_code}</span> · {t.name}
                          </span>
                          {t.reps > 1 && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                              ×{t.reps} reps
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {t.group ? `${t.group} · ` : ""}
                          {d.label} · {t.reps} of {t.reps_gap} rep{t.reps_gap === 1 ? "" : "s"} left ·{" "}
                          {t.row_units} unit{t.row_units === 1 ? "" : "s"}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {canDrive && (
                <button
                  onClick={reroll}
                  disabled={busy}
                  className="mt-3 w-full rounded-md border border-neutral-300 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Not these — pick a different set
                </button>
              )}
            </div>

            {/* accept form */}
            {canDrive ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-neutral-800">Accept & generate CSV</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Enter the run details. Accepting marks these missions <b>in&nbsp;progress</b> and
                  produces the ready-to-use collection CSV.
                </p>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-neutral-500">Robot (optional)</span>
                    <select
                      value={robotId}
                      onChange={(e) => setRobotId(e.target.value)}
                      className="cq-select w-full"
                    >
                      <option value="">— none —</option>
                      {robots.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.robot_code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-neutral-500">Payload</span>
                      <input
                        value={payload}
                        onChange={(e) => setPayload(e.target.value)}
                        placeholder="e.g. Blender-3"
                        className="cq-select w-full"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-neutral-500">Run lab</span>
                      <input
                        value={lab}
                        onChange={(e) => setLab(e.target.value)}
                        placeholder="e.g. Apt A"
                        className="cq-select w-full"
                      />
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={reset}
                    className="rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50"
                  >
                    Start over
                  </button>
                  <button
                    onClick={accept}
                    disabled={busy}
                    className="flex-1 rounded-md bg-[color:var(--cq-iris)] py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ? "Accepting…" : "Accept run →"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-white p-4 text-xs text-neutral-500">
                Read-only — your role can’t accept runs.
              </div>
            )}
          </section>
        )}

        {/* ---------------------------------------------------------- Step 3: Collect & Record */}
        {step === "collect" && accepted && proposal && (
          <section className="space-y-4">
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-800">
                  Run ready ·{" "}
                  <span className="font-mono text-neutral-500">
                    {accepted.run.encoded_code ?? accepted.run.provisional_code ?? accepted.run.id.slice(0, 8)}
                  </span>
                </h2>
                <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-[color:var(--cq-iris)]">
                  {accepted.task_count} mission{accepted.task_count === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-500">
                Download the CSV to run collection. When you’re done, uncheck any mission you didn’t
                complete (its row would be deleted from the CSV) and record the results.
              </p>
              <button
                onClick={() =>
                  downloadCsv(
                    `${accepted.run.provisional_code ?? "run"}.csv`,
                    accepted.run_csv,
                  )
                }
                className="mt-4 w-full rounded-md border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Download run CSV
              </button>
              {accepted.saved_path && (
                <p className="mt-2 break-all text-xs text-neutral-500">
                  Saved to <span className="font-medium text-neutral-700">CSV_SYNC</span>:{" "}
                  <code className="text-neutral-600">{accepted.saved_path}</code>
                </p>
              )}
            </div>

            {!uploaded ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-neutral-800">Record what was collected</h2>
                <ul className="mt-3 divide-y divide-neutral-100">
                  {proposal.missions.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-2">
                      <input
                        id={`c-${t.id}`}
                        type="checkbox"
                        checked={completed[t.id] ?? false}
                        disabled={!canDrive}
                        onChange={(e) => setCompleted((c) => ({ ...c, [t.id]: e.target.checked }))}
                        className="h-4 w-4"
                      />
                      <label htmlFor={`c-${t.id}`} className="min-w-0 flex-1 text-sm text-neutral-800">
                        <span className="font-mono text-neutral-500">{t.mission_code}</span> · {t.name}
                      </label>
                    </li>
                  ))}
                </ul>
                {canDrive && (
                  <button
                    onClick={record}
                    disabled={busy}
                    className="mt-4 w-full rounded-md bg-[color:var(--cq-iris)] py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ? "Recording…" : "Record results"}
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-neutral-800">Results recorded</h2>
                <div className="mt-2 flex gap-4 text-sm">
                  <span className="text-green-700">{uploaded.recorded.length} recorded</span>
                  <span className="text-neutral-500">{uploaded.reverted.length} back to available</span>
                </div>
                <ul className="mt-3 divide-y divide-neutral-100">
                  {uploaded.missions.map((c) => {
                    const t = proposedById[c.mission_id];
                    return (
                      <li key={c.mission_id} className="flex items-center gap-3 py-2 text-sm">
                        <ScheduleBadge status={c.schedule_status} />
                        <span className="min-w-0 flex-1 truncate text-neutral-800">
                          <span className="font-mono text-neutral-500">{t?.mission_code ?? c.mission_id.slice(0, 6)}</span>
                          {t ? ` · ${t.name}` : ""}
                        </span>
                        <span className="text-xs text-neutral-400">{c.reps_gap} rep{c.reps_gap === 1 ? "" : "s"} left</span>
                      </li>
                    );
                  })}
                </ul>
                <button
                  onClick={reset}
                  className="mt-4 w-full cq-btn-primary rounded-lg py-2 text-sm font-medium"
                >
                  Build another run
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function FitBadge({ total, budget, packed }: { total: number; budget: number; packed: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        packed ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
      }`}
      title="Effort units used vs. a full run budget"
    >
      {total}/{budget} units {packed ? "· full" : ""}
    </span>
  );
}

function ScheduleBadge({ status }: { status: "AVAILABLE" | "IN_PROGRESS" | "RECORDED" }) {
  const map = {
    RECORDED: { cls: "bg-green-50 text-green-700", label: "Recorded" },
    IN_PROGRESS: { cls: "bg-amber-50 text-amber-700", label: "In progress" },
    AVAILABLE: { cls: "bg-neutral-100 text-neutral-500", label: "Available" },
  }[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${map.cls}`}>{map.label}</span>;
}
