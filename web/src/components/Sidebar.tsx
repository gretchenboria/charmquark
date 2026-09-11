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
  IconSettings,
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

/**
 * Navigation, ordered as a fleet-orchestration system rather than a scheduler.
 *
 * The fleet is the subject of this product: robots, the sensors mounted on them,
 * the labs they work in and the operators who run them. Scheduling is one thing
 * you *do* to a fleet, not the centre of it — so Operations sits below Fleet,
 * and the calendar is one entry inside it rather than the first thing in the app.
 */
const SECTIONS: { title: string; items: { href: string; label: string; icon: Icon }[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/home", label: "Fleet Overview", icon: IconDashboard },
    ],
  },
  {
    title: "Fleet",
    items: [
      { href: "/robots", label: "Robots", icon: IconRobot },
      { href: "/sensors", label: "Sensors", icon: IconSensor },
      { href: "/labs", label: "Labs", icon: IconLab },
      { href: "/operators", label: "Operators", icon: IconOperator },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/coverage", label: "Coverage", icon: IconDashboard },
      { href: "/schedule", label: "Run Board", icon: IconCalendar },
      { href: "/auto-schedule", label: "Auto-Schedule", icon: IconWorkflow },
      { href: "/monitoring", label: "Monitoring", icon: IconReport },
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
    title: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: IconReport },
      { href: "/workflows", label: "Workflow Designer", icon: IconWorkflow },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/users", label: "Users & Roles", icon: IconRobot },
    ],
  },
  {
    title: "Resources",
    items: [
      { href: "/", label: "Documentation", icon: IconReport },
      { href: "/home", label: "Tutorial", icon: IconWorkflow },
      { href: "/api-reference", label: "API Reference", icon: IconLab },
      { href: "/integrations", label: "Integrations", icon: IconSettings },
      { href: "https://github.com/gretchenboria/charmquark", label: "README", icon: IconMission },
    ],
  },
];

function UtcClock() {
  return (
    <div className="mb-4 mt-2 flex items-center justify-between rounded bg-white/5 px-3 py-2 text-xs font-medium text-white/90">
      <div className="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        Global System Time
      </div>
      <span className="font-mono text-white">UTC</span>
    </div>
  );
} 

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
    <nav className="cq-rail flex w-64 shrink-0 flex-col">
      <div className="flex flex-col items-center gap-2.5 border-b border-white/10 px-4 pb-5 pt-6">
        <div className="rounded-xl bg-white p-2 shadow-sm mb-1">
          <Image
            src="/cq-logo.png"
            alt=""
            width={128}
            height={128}
            priority
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
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
                  className="cq-rail-link relative mx-2 flex items-center gap-2.5 px-3 py-2.5 md:py-1.5 text-sm"
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
        <UtcClock />
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
              className="w-full rounded-lg border border-white/15 py-2.5 md:py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              Log out
            </button>
            <button
              onClick={() => resetOnboarded(user)}
              className="mt-1.5 w-full text-center py-2 text-[11px] text-white/35 transition-colors hover:text-white/70"
            >
              Show intro
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
