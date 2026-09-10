"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";

import { api } from "@/lib/api";
import { canSeeNavItem } from "@/lib/roleViews";
import { ROLE_LABEL, clearUser, resetOnboarded } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { CloudStatus } from "@/lib/types";
import {
  IconCalendar,
  IconDashboard,
  IconDevice,
  IconInventory,
  IconLab,
  IconOperator,
  IconRobot,
  IconReport,
  IconStudy,
  IconTask,
  IconWorkflow,
} from "./icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Backend database backing + reachability. Fetches on mount and refreshes on an
// interval; failures are swallowed so the sidebar never crashes when the API is down.
function CloudIndicator() {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () =>
      api
        .getCloudStatus()
        .then((s) => {
          if (!alive) return;
          setStatus(s);
          setFailed(false);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    check();
    const t = setInterval(check, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!status && !failed) return null;

  const reachable = !!status?.reachable && !failed;
  const label = failed || !status
    ? "Backend unreachable"
    : status.database === "postgresql"
      ? `PostgreSQL@${status.provider}`
      : "Local SQLite";

  return (
    <div className="mb-2 flex items-center gap-2 text-[11px] text-neutral-500" title={status?.detail ?? ""}>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${reachable ? "bg-green-500" : "bg-red-500"}`}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </div>
  );
}

const SECTIONS: { title: string; items: { href: string; label: string; icon: Icon }[] }[] = [
  {
    title: "Plan",
    items: [
      { href: "/home", label: "Home", icon: IconDashboard },
      { href: "/schedule", label: "Schedule", icon: IconCalendar },
      { href: "/auto-schedule", label: "Auto-Schedule", icon: IconWorkflow },
      { href: "/monitoring", label: "Monitoring", icon: IconReport },
      { href: "/reports", label: "Reports", icon: IconReport },
    ],
  },
  {
    title: "Workflows",
    items: [
      { href: "/workflows", label: "Workflow Designer", icon: IconWorkflow },
    ],
  },
  {
    title: "Catalog",
    items: [
      { href: "/studies", label: "Studies", icon: IconStudy },
      { href: "/tasks", label: "Tasks", icon: IconTask },
      { href: "/catalog-sync", label: "Catalog Sync", icon: IconWorkflow },
      { href: "/inventory", label: "Inventory", icon: IconInventory },
    ],
  },
  {
    title: "Resources",
    items: [
      { href: "/robots", label: "Robots", icon: IconRobot },
      { href: "/operators", label: "Operators", icon: IconOperator },
      { href: "/labs", label: "Labs", icon: IconLab },
      { href: "/devices", label: "Devices", icon: IconDevice },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/users", label: "Users & Roles", icon: IconRobot },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useUser();

  // Role-gated nav: robot operators lose analytics/reporting entries; drop any section
  // left empty afterward. Unknown/loading role keeps the full nav (safe default).
  const sections = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canSeeNavItem(user?.role, item.href)),
  })).filter((section) => section.items.length > 0);

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3.5">
        <Image src="/charmquark-wordmark.svg" alt="CharmQuark" width={82} height={30} priority />
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-neutral-400">DataOps</span>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {sections.map((section) => (
          <div key={section.title} className="mb-3">
            <div className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-4 py-1.5 text-sm ${
                    active
                      ? "border-l-2 border-neutral-900 bg-neutral-100 font-medium text-neutral-900"
                      : "border-l-2 border-transparent text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  <Icon className={active ? "text-neutral-900" : "text-neutral-400"} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* connectivity + logged-in user + logout */}
      <div className="border-t border-neutral-100 p-3">
        <CloudIndicator />
        {user && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                {user.name.split(" ").map((p) => p[0]).join("")}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-neutral-800">{user.name}</div>
                <div className="text-[11px] text-neutral-500">{ROLE_LABEL[user.role]}</div>
              </div>
            </div>
            <button
              onClick={clearUser}
              className="w-full rounded border border-neutral-200 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              Log out
            </button>
            <button
              onClick={() => resetOnboarded(user)}
              className="mt-1.5 w-full text-center text-[11px] text-neutral-400 hover:text-neutral-600"
            >
              Show intro
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
