"use client";

import type { ReactNode } from "react";
import type { Study } from "@/lib/types";

/** A page header with a title and a study selector (used by dashboard + reports). */
export function StudyHeader({
  title,
  studies,
  studyId,
  onChange,
  right,
}: {
  title: string;
  studies: Study[];
  studyId: string | null;
  onChange: (id: string | null) => void;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-4 border-b border-neutral-200 bg-white px-6 py-3">
      <h1 className="text-lg font-semibold">{title}</h1>
      <select
        value={studyId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
      >
        {studies.length === 0 && <option value="">No studies</option>}
        {studies.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="ml-auto flex items-center gap-2">{right}</div>
    </header>
  );
}
