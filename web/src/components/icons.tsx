// Monoline icons (hand-drawn inline SVG, no icon-font dependency).
// 1.75 stroke, 24px grid.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const IconDashboard = (p: P) => (
  <svg {...base(p)}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
);
export const IconCalendar = (p: P) => (
  <svg {...base(p)}><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>
);
export const IconReport = (p: P) => (
  <svg {...base(p)}><path d="M6 2.5h8l4 4V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" /><path d="M13 2.5V7h4.5M8.5 13h7M8.5 17h7" /></svg>
);
export const IconCampaign = (p: P) => (
  <svg {...base(p)}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5A1.5 1.5 0 0 0 20 18.5v-13Z" /></svg>
);
export const IconMission = (p: P) => (
  <svg {...base(p)}><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="M8 9l2 2 3-3.5M8 15.5h8" /></svg>
);
export const IconInventory = (p: P) => (
  <svg {...base(p)}><path d="M3.5 7.5 12 3l8.5 4.5V16L12 20.5 3.5 16V7.5Z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v8.5" /></svg>
);
export const IconWorkflow = (p: P) => (
  <svg {...base(p)}><rect x="3" y="4" width="6" height="4" rx="1" /><rect x="15" y="7" width="6" height="4" rx="1" /><rect x="9" y="15" width="6" height="4" rx="1" /><path d="M9 6h3a2 2 0 0 1 2 2v0M12 15v-3M18 11v1a2 2 0 0 1-2 2h-1" /></svg>
);
export const IconRobot = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>
);
export const IconOperator = (p: P) => (
  <svg {...base(p)}><circle cx="10" cy="8" r="3.2" /><path d="M4 20a6 6 0 0 1 12 0" /><path d="M17.5 10.5l1.5 1.5 3-3.5" /></svg>
);
export const IconLab = (p: P) => (
  <svg {...base(p)}><path d="M12 21c4-4.5 6.5-7.8 6.5-11a6.5 6.5 0 1 0-13 0C5.5 13.2 8 16.5 12 21Z" /><circle cx="12" cy="10" r="2.4" /></svg>
);
export const IconSensor = (p: P) => (
  <svg {...base(p)}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>
);
