// Client-side session: which preset user is "logged in". Sent as X-CharmQuark-Role /
// X-CharmQuark-User headers so the backend enforces role-group permissions.
"use client";

export type Role = "PM" | "FLEET_LEAD" | "ROBOT_OPERATOR";

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
export const canCreate = (_r: Role | undefined) => true;
export const canUpdate = (_r: Role | undefined) => true;
export const canDelete = (_r: Role | undefined) => true;
export const canDeleteCampaign = (_r: Role | undefined) => true;
export const isLegalReviewer = (r: Role | undefined) => r === "FLEET_LEAD";

// Back-compat aliases used across existing components:
export const canWriteCatalog = canCreate;          // creating catalog objects = PM
export const canWriteRun = canUpdate;           // run operations = PM + Robot Operator

// Planning ownership: confirming a run, advancing the post-collection pipeline, and
// deleting a run belong to the PM / Fleet Lead. Robot operators run runs (execute); they
// don't confirm or hand-crank the pipeline.
export const canConfirmRun = (r: Role | undefined) => r === "PM" || r === "FLEET_LEAD";

export const ROLE_LABEL: Record<Role, string> = {
  PM: "PM",
  FLEET_LEAD: "Fleet Lead",
  ROBOT_OPERATOR: "Robot Operator",
};
