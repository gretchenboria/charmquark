import type { Session } from "@/lib/types";
import { StatusDot } from "./StatusDot";

function line(label: string, value: string | null) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-neutral-400">{label}</span>
      <span className={value ? "text-neutral-700" : "text-neutral-300"}>{value ?? "—"}</span>
    </div>
  );
}

export function SessionCard({
  session,
  labels,
  onClick,
}: {
  session: Session;
  labels: { robot?: string; operator?: string; lab?: string; taskGroup?: string };
  onClick: () => void;
}) {
  const code = session.encoded_code ?? session.provisional_code ?? "—";
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-neutral-200 bg-white p-2.5 text-left shadow-sm transition hover:border-neutral-300 hover:shadow"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <StatusDot state={session.state} />
      </div>
      <div className="mb-1 truncate font-mono text-[11px] text-neutral-500">{code}</div>
      {line("P", labels.robot ?? null)}
      {line("M", labels.operator ?? null)}
      {line("L", labels.lab ?? null)}
      {line("T", labels.taskGroup ?? null)}
    </button>
  );
}
