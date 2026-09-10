import type { SessionState } from "@/lib/types";

export const STATE_META: Record<SessionState, { label: string; dot: string; text: string }> = {
  DRAFT: { label: "Draft", dot: "bg-neutral-400", text: "text-neutral-500" },
  ASSEMBLING: { label: "Assembling", dot: "bg-amber-500", text: "text-amber-600" },
  READY: { label: "Ready", dot: "bg-green-600", text: "text-green-700" },
  CONFIRMED: { label: "Confirmed", dot: "bg-teal-600", text: "text-teal-700" },
  IN_EXECUTION: { label: "In execution", dot: "bg-teal-600", text: "text-teal-700" },
  COLLECTED: { label: "Collected", dot: "bg-sky-600", text: "text-sky-700" },
  EXTRACTED: { label: "Extracted", dot: "bg-blue-600", text: "text-blue-700" },
  MANUAL_QA: { label: "Manual QA", dot: "bg-indigo-500", text: "text-indigo-600" },
  VALIDATED: { label: "Validated", dot: "bg-indigo-600", text: "text-indigo-700" },
  UPLOADED: { label: "Uploaded", dot: "bg-purple-600", text: "text-purple-700" },
  DONE: { label: "Done", dot: "bg-neutral-600", text: "text-neutral-700" },
  BLOCKED: { label: "Blocked", dot: "bg-red-600", text: "text-red-700" },
  CANCELLED: { label: "Cancelled", dot: "bg-neutral-300", text: "text-neutral-400" },
};

export function StatusDot({ state }: { state: SessionState }) {
  const m = STATE_META[state];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />
      <span className={`text-xs font-medium ${m.text}`}>{m.label}</span>
    </span>
  );
}
