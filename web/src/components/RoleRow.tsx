export function RoleRow({
  label,
  value,
  issue,
  canSwap = true,
  onSwap,
}: {
  label: string;
  value: string | null;
  issue?: string;
  canSwap?: boolean;
  onSwap: () => void;
}) {
  const ok = !issue;
  return (
    <div className="flex items-start justify-between border-b border-neutral-100 py-2.5">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</div>
        <div className="truncate text-sm text-neutral-800">{value ?? "— not assigned"}</div>
        <div className={`text-xs ${ok ? "text-green-600" : "text-red-600"}`}>
          {ok ? "✓ eligible" : `⚠ ${issue}`}
        </div>
      </div>
      {canSwap && (
        <button
          onClick={onSwap}
          className="ml-3 shrink-0 rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
        >
          Swap
        </button>
      )}
    </div>
  );
}
