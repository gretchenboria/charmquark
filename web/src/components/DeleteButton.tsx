"use client";

import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useToast } from "./Toast";

/** Role-gated delete button used on detail pages. Confirms, calls the API, routes back. */
export function DeleteButton({
  hidden,
  label = "Delete",
  confirm = "Delete this item?",
  onDelete,
  backHref,
}: {
  hidden?: boolean;
  label?: string;
  confirm?: string;
  onDelete: () => Promise<void>;
  backHref: string;
}) {
  const toast = useToast();
  const router = useRouter();
  if (hidden) return null;
  const run = async () => {
    if (!window.confirm(confirm)) return;
    try {
      await onDelete();
      toast("success", "Deleted");
      router.push(backHref);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Delete failed");
    }
  };
  return (
    <button onClick={run} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
      {label}
    </button>
  );
}
