// Centralized role-based view gating. Robot operators are operational (field execution),
// not analysts, so they see a leaner surface: no analytics/reporting nav or widgets.
// PM and Fleet Lead see the full dashboard. Unknown/loading role -> full view.
import type { Role } from "./session";

// Analytics / reporting surfaces hidden from robot operators (matched by nav href).
const ANALYTICS_HREFS = new Set(["/monitoring", "/reports"]);

/** True when the role is a known operational-only role (Robot Operator). */
export function isOperationalRole(role: Role | undefined): boolean {
  return role === "ROBOT_OPERATOR";
}

/** True when analytics/reporting surfaces should be shown for this role. */
export function canSeeAnalytics(role: Role | undefined): boolean {
  // Default to the fuller view for unknown/loading roles.
  return !isOperationalRole(role);
}

/** Whether a sidebar nav item (by href) is visible for the given role. */
export function canSeeNavItem(role: Role | undefined, href: string): boolean {
  if (canSeeAnalytics(role)) return true;
  return !ANALYTICS_HREFS.has(href);
}
