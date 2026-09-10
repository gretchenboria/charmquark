// CharmQuark brand palette.
//
// Sampled from the mark: the logo runs a single gradient from deep violet on the
// left to a clear blue on the right (#470E6C -> #3576C2). Everything here is
// anchored to that axis, and the accents are deliberately WARM — apricot, rose,
// sage — so they read as a counterpoint to the cool brand rather than competing
// with it. No cyan or teal: they sit too close to the brand blue and make the
// whole surface go cold.
//
// Use these for ALL charts and status colors (burndown, throughput, QA pass-rate,
// robot utilization, sensor health) so the app reads as one system.

/** The brand gradient stops, in order. */
export const BRAND = {
  plum: "#3A0D4E",   // deepest — headers, the dark end of the ramp
  violet: "#6D28A8", // brand purple
  iris: "#5A4CA0",   // the midpoint where violet becomes blue
  blue: "#3576C2",   // brand blue
} as const;

/** `background: CQ_GRADIENT` reproduces the mark's sweep. */
export const CQ_GRADIENT = `linear-gradient(135deg, ${BRAND.violet} 0%, ${BRAND.iris} 52%, ${BRAND.blue} 100%)`;

export const CQ = {
  // --- brand axis ---
  violet: BRAND.violet,
  iris: BRAND.iris,
  blue: BRAND.blue,
  plum: BRAND.plum,
  lilac: "#9B6FD4",       // lifted violet, for secondary series and hovers
  periwinkle: "#6E86D6",  // lifted blue

  // --- warm semantic accents ---
  sage: "#4E9E71",        // healthy / ready / pass
  apricot: "#E0913A",     // attention / assembling / in progress
  rose: "#D4536B",        // fault / blocked / fail
  honey: "#C9A227",       // caution, secondary series

  // --- neutral, tinted toward the brand so grays never look muddy ---
  slate: "#7B7A96",       // idle / draft / unknown
} as const;

/**
 * Ordered series palette. The first four stay distinguishable under the common
 * colorblindness types (blue / apricot / violet / sage separate on both axes).
 */
export const CHART_SERIES: string[] = [
  CQ.blue,
  CQ.apricot,
  CQ.violet,
  CQ.sage,
  CQ.lilac,
  CQ.rose,
  CQ.periwinkle,
  CQ.honey,
];

/** Semantic status colors (readiness, QA, the run pipeline). */
export const STATUS_COLOR = {
  ready: CQ.sage,
  assembling: CQ.apricot,
  blocked: CQ.rose,
  draft: CQ.slate,
  confirmed: CQ.iris,
  done: CQ.blue,
} as const;
