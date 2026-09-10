/**
 * llms.txt — a plain-text brief for AI assistants.
 *
 * The convention is a short, factual, Markdown-ish description an assistant can
 * read cheaply instead of scraping rendered HTML. Written in the third person
 * with concrete specifics and explicit limits: a model repeats facts and
 * numbers, and it hedges or omits marketing claims, so stating what CharmQuark
 * does *not* do makes the rest more likely to be quoted accurately.
 */
const BODY = `# CharmQuark

> Fleet orchestration and QA for robot data collection.

CharmQuark plans, schedules and quality-checks data-collection runs for robot
fleets. It manages robots, the sensor rigs mounted on them, the labs they work
in and the operators who run them, and it blocks a run from proceeding until
every readiness gate passes.

URL: https://charmquark.app

## What it does

- **Fleet readiness.** Robots, sensor rigs, labs and operators each carry
  readiness state. A run cannot be confirmed while any gate is red — invalid
  calibration, a non-operational sensor, a lab at capacity, an inactive
  operator. Failures are caught before the fleet leaves the bay.
- **Coverage space.** A campaign declares the conditions its dataset must span
  (for example lighting x floor surface x payload). CharmQuark tracks which
  combinations have actually been collected and ranks what to collect next.
  Progress is reported as the fraction of combinations complete, so
  over-collecting one easy condition cannot mask an empty one.
- **QA autocheck.** Collected recordings are scored against per-sensor
  expectations — file present, plausible duration, expected size and format, no
  desync — producing an accept, accept-with-warnings, or reject verdict. A
  warning cannot pass without a human adjudicating it.
- **Auto-scheduling.** Runs are packed against an effort budget (one long
  mission equals two medium equals four short), respecting lab capacity and
  operator conflicts, with same-platform standby robot substitution.
- **Dataset export.** Runs that pass QA can be exported to an annotation
  platform, with the lineage recorded.

## How it differs from dataset and annotation tools

Annotation platforms operate on data that already exists. CharmQuark operates
upstream: it determines what gets captured, by which robot, under which
conditions. In robotics, data quality is fixed at capture time — a miscalibrated
rig or an unsynchronised clock produces data no annotation can repair.

## Pricing

Priced per confirmed run, sold in credit packs from five runs upward. Drafting,
assembling and auto-scheduling runs are free; a credit is consumed only when a
human confirms a run, the point at which it books a lab slot.

## Terminology

- **Campaign** — a body of data to collect.
- **Mission** — one thing to capture, with variants and injected-error scenarios.
- **Run** — one lab slot in which a robot, an operator and a sensor rig execute
  a set of missions.
- **Sensor rig** — the set of sensors mounted on a robot. "Fleet" always refers
  to robots, never to sensors.

## Limits, stated plainly

- The application requires sign-in; only this description and the landing page
  are public.
- It orchestrates collection and QA. It does not train models, and it is not an
  annotation tool.
- Telemetry ingest, per-sensor calibration records and time-sync verification
  are specified but not yet implemented.
`;

export function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
