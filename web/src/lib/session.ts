// Client-side session: which preset user is "logged in". Sent as X-CharmQuark-Role /
// X-CharmQuark-User headers so the backend enforces role-group permissions.
"use client";

import type { Role } from "@contracts";
export type { Role };

export interface User {
  name: string;
  role: Role;
  title: string;
}

// Preset users (groups = roles). Mirrors Docs/PRD.md personas.
export const PRESET_USERS: User[] = [
  { name: "Sam Chen", role: "PM", title: "Project Manager" },
  { name: "Alex Rivera", role: "ROBOT_OPERATOR", title: "Field Robot Operator" },
  { name: "Jordan Lee", role: "FLEET_LEAD", title: "Fleet Lead" },
];

const KEY = "charmquark.user";

// Per-TAB identity (sessionStorage): open two tabs and log in as different users to
// exercise simultaneous multi-user access against the same backend.
export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setUser(u: User): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(u));
  window.dispatchEvent(new Event("charmquark-user-changed"));
}

export function clearUser(): void {
  window.sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event("charmquark-user-changed"));
}

// First-login onboarding: completion persists per user across runs (localStorage).
const ONBOARD_KEY = "charmquark.onboarded";

function onboardId(u: User): string {
  return `${u.role}:${u.name}`;
}

export function hasOnboarded(u: User): boolean {
  if (typeof window === "undefined") return true;
  try {
    const done = JSON.parse(window.localStorage.getItem(ONBOARD_KEY) || "[]") as string[];
    return done.includes(onboardId(u));
  } catch {
    return false;
  }
}

export function markOnboarded(u: User): void {
  try {
    const done = JSON.parse(window.localStorage.getItem(ONBOARD_KEY) || "[]") as string[];
    if (!done.includes(onboardId(u))) {
      done.push(onboardId(u));
      window.localStorage.setItem(ONBOARD_KEY, JSON.stringify(done));
    }
  } catch {
    window.localStorage.setItem(ONBOARD_KEY, JSON.stringify([onboardId(u)]));
  }
  window.dispatchEvent(new Event("charmquark-onboard-changed"));
}

export function resetOnboarded(u: User): void {
  try {
    const done = JSON.parse(window.localStorage.getItem(ONBOARD_KEY) || "[]") as string[];
    window.localStorage.setItem(ONBOARD_KEY, JSON.stringify(done.filter((x) => x !== onboardId(u))));
  } catch {
    /* noop */
  }
  window.dispatchEvent(new Event("charmquark-onboard-changed"));
}

// Permission helpers — FULL CRUD for every signed-in role (no hard-coded read-only).
// Legal review stays a Campaign-Lead approval verdict (a domain action, not a read-only gate).
// Client-side mirrors of the server policy in api/src/auth.ts.
//
// These only decide what to SHOW — the server is the authority and re-checks
// every call. Their job is to stop an operator being offered a button that
// returns 403, which reads as a broken app rather than a permission boundary.
// Keep them in step with POLICY; if the two drift, the server wins and the UI
// looks buggy.
const PM_UP = (r: Role | undefined) => r === "PM" || r === "FLEET_LEAD";

/** Authoring the catalogue and the fleet is a planning act. */
export const canCreate = PM_UP;
export const canUpdate = PM_UP;
/** Removing things from the fleet is narrower than editing them. */
export const canDelete = (r: Role | undefined) => r === "FLEET_LEAD";
export const canDeleteCampaign = (r: Role | undefined) => r === "FLEET_LEAD";
export const isLegalReviewer = (r: Role | undefined) => r === "FLEET_LEAD";
/** Administering users rewrites the authorization table itself. */
export const canAdminUsers = (r: Role | undefined) => r === "FLEET_LEAD";
/** Buying credits spends real money. */
export const canBuyCredits = PM_UP;

/** Authoring catalogue objects — campaigns, missions, inventory. */
export const canWriteCatalog = canCreate;

/**
 * Executing a run — logging, QA, coverage, upload — is open to every role.
 * This is the operator's job and the reason the role exists; only the money
 * and safety actions on a run are narrower.
 */
export const canWriteRun = (_r: Role | undefined) => true;

export const canConfirmRun = (r: Role | undefined) => r === "PM" || r === "FLEET_LEAD";

export const ROLE_LABEL: Record<Role, string> = {
  PM: "PM",
  FLEET_LEAD: "Fleet Lead",
  ROBOT_OPERATOR: "Robot Operator",
};
