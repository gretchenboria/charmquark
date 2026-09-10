// CharmQuark brand palette. Use these for ALL charts and status colors
// (burndown, throughput, QA pass-rate, robot utilization, sensor health, etc.)
// so the whole app reads as one system.
//
// Chosen for perceptual separation in both light and dark appearance and for
// colorblind-safe ordering in the series ramp (blue/orange lead).

export const CQ = {
  blue: "#2E6FF2",   // primary — nominal / done
  green: "#2FB673",  // healthy / ready
  amber: "#E8912D",  // attention / assembling
  red: "#E14747",    // fault / blocked
  teal: "#1FA8B8",   // confirmed / in-flight
  violet: "#7C5CE0", // secondary series
  magenta: "#D6459B",// secondary series
  yellow: "#E5C230", // secondary series
  slate: "#7A8493",  // idle / draft / unknown
} as const;

// Ordered series palette for multi-series charts. Order matters: the first four
// stay distinguishable under the common colorblindness types.
export const CHART_SERIES: string[] = [
  CQ.blue,
  CQ.amber,
  CQ.green,
  CQ.violet,
  CQ.teal,
  CQ.magenta,
  CQ.red,
  CQ.yellow,
];

// Semantic status colors (readiness, QA, pipeline).
export const STATUS_COLOR = {
  ready: CQ.green,
  assembling: CQ.amber,
  blocked: CQ.red,
  draft: CQ.slate,
  confirmed: CQ.teal,
  done: CQ.blue,
} as const;
