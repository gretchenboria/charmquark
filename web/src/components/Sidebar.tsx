"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";

import { api } from "@/lib/api";
import { CreditMeter } from "./Billing";
import { canSeeNavItem } from "@/lib/roleViews";
import { ROLE_LABEL, clearUser, resetOnboarded } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { CloudStatus } from "@/lib/types";
import {
  IconCalendar,
  IconDashboard,
  IconSensor,
  IconInventory,
  IconLab,
  IconOperator,
  IconRobot,
  IconReport,
  IconCampaign,
  IconMission,
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
    <div className="mb-2 flex items-center gap-2 text-[11px] text-white/45" title={status?.detail ?? ""}>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: reachable ? "#4E9E71" : "#D4536B",
                 boxShadow: reachable ? "0 0 7px 1px rgba(78,158,113,.6)" : "0 0 7px 1px rgba(212,83,107,.6)" }}
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
      { href: "/campaigns", label: "Campaigns", icon: IconCampaign },
      { href: "/missions", label: "Missions", icon: IconMission },
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
      { href: "/sensors", label: "Sensors", icon: IconSensor },
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
    <nav className="cq-rail flex w-56 shrink-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
        <Image src="/charmquark-wordmark-light.svg" alt="CharmQuark" width={116} height={25} priority />
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {sections.map((section) => (
          <div key={section.title} className="mb-3">
            <div className="cq-eyebrow px-4 pb-1.5 text-white/35">{section.title}</div>
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active}
                  className="cq-rail-link relative mx-2 flex items-center gap-2.5 px-3 py-1.5 text-sm"
                >
                  <Icon className={active ? "text-white" : "text-white/45"} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* connectivity + logged-in user + logout */}
      <div className="border-t border-white/10 p-3">
        <CloudIndicator />
        <CreditMeter />
        {user && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-1 ring-white/20"
                   style={{ background: "linear-gradient(135deg,#6D28A8,#3576C2)" }}>
                {user.name.split(" ").map((p) => p[0]).join("")}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white/90">{user.name}</div>
                <div className="text-[11px] text-white/45">{ROLE_LABEL[user.role]}</div>
              </div>
            </div>
            <button
              onClick={clearUser}
              className="w-full rounded-lg border border-white/15 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              Log out
            </button>
            <button
              onClick={() => resetOnboarded(user)}
              className="mt-1.5 w-full text-center text-[11px] text-white/35 transition-colors hover:text-white/70"
            >
              Show intro
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
