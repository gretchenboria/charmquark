import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "./ui/Card";

export interface Field {
  label: string;
  value: ReactNode;
}

export function DetailPage({
  title,
  subtitle,
  backHref,
  backLabel,
  fields,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref: string;
  backLabel: string;
  fields: Field[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-6 py-3">
        <Link href={backHref} className="text-xs text-neutral-500 hover:text-neutral-800">
          ← {backLabel}
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </header>
      <div className="flex-1 overflow-auto p-6">
        <Card className="mb-6 max-w-2xl">
          <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-y-2 text-sm">
            {fields.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-neutral-400">{f.label}</dt>
                <dd className="text-neutral-800">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {children}
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-neutral-700">{title}</h2>
      {children}
    </section>
  );
}

export function LinkList({
  items,
  empty = "None.",
}: {
  items: { href?: string; label: string; note?: string }[];
  empty?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-neutral-400">{empty}</p>;
  return (
    <ul className="divide-y divide-neutral-100 rounded border border-neutral-200 bg-white">
      {items.map((it, i) => (
        <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
          {it.href ? (
            <Link href={it.href} className="font-medium text-[color:var(--cq-iris)] hover:underline">
              {it.label}
            </Link>
          ) : (
            <span className="text-neutral-800">{it.label}</span>
          )}
          {it.note && <span className="text-xs text-neutral-400">{it.note}</span>}
        </li>
      ))}
    </ul>
  );
}
