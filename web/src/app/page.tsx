import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

/**
 * Public landing page — the only route a crawler or an AI assistant can reach.
 *
 * Everything else is behind Cloudflare Access, so this page carries the whole
 * discoverability burden. It is written to be *quotable*: plain declarative
 * sentences, real numbers, and a FAQ whose answers stand alone when lifted out
 * of context, because that is how an assistant will use them. Marketing
 * adjectives are avoided deliberately — they are exactly the sentences a model
 * will not repeat, and a human skims past them too.
 */

const SITE = "https://charmquark.app";
const TAGLINE = "Fleet orchestration and QA for robot data collection";
const SUMMARY =
  "CharmQuark plans, schedules and quality-checks data-collection runs for robot fleets. " +
  "It tracks which robots, sensor rigs, labs and operators are fit to run, blocks a run " +
  "until every readiness gate passes, and measures coverage of the conditions a dataset " +
  "actually needs rather than a raw repetition count.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: `CharmQuark — ${TAGLINE}`,
    template: "%s — CharmQuark",
  },
  description: SUMMARY,
  keywords: [
    "fleet orchestration", "robot data collection", "physical AI",
    "robot fleet management", "multisensor fusion", "sensor calibration",
    "data collection QA", "robotics dataset coverage", "ROS data pipeline",
    "robot operations software", "RobotOps", "DataOps for robotics",
  ],
  alternates: { canonical: SITE },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "CharmQuark",
    title: `CharmQuark — ${TAGLINE}`,
    description: SUMMARY,
    images: [{ url: "/charmquark-logo.svg", width: 128, height: 128, alt: "CharmQuark" }],
  },
  twitter: {
    card: "summary_large_image",
    title: `CharmQuark — ${TAGLINE}`,
    description: SUMMARY,
  },
  robots: { index: true, follow: true },
};

/**
 * Structured data. Search engines use SoftwareApplication for the product card;
 * the FAQPage block is what tends to get surfaced verbatim in answer engines,
 * which is why each answer is written to survive being quoted on its own.
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: "What is CharmQuark?",
    a: "CharmQuark is fleet orchestration software for robot data collection. It manages a fleet of robots, the sensor rigs mounted on them, the labs they operate in and the operators who run them, and it schedules and quality-checks the data-collection runs those parts carry out.",
  },
  {
    q: "How is it different from a dataset or annotation tool?",
    a: "Annotation platforms begin after the data exists. CharmQuark operates upstream of that: it decides what gets captured, by which robot, under which conditions, and refuses to let a run proceed until calibration, sensors, operator certification and lab availability all check out. Data quality in robotics is determined at capture time, and that is the point CharmQuark controls.",
  },
  {
    q: "What is a coverage space?",
    a: "A coverage space is the set of conditions a dataset must span — for example lighting by floor surface by payload. CharmQuark tracks which combinations the fleet has actually collected and reports progress as the fraction of combinations complete, so over-collecting one easy condition cannot mask an empty one. A target of 60 runs cannot tell 60 varied runs from the same run 60 times; a coverage space can.",
  },
  {
    q: "What does the QA autocheck do?",
    a: "After a run is collected, CharmQuark scores the recordings against the campaign's expectations: that every sensor produced a file, that segment durations are plausible, that file sizes and types match what that sensor should emit, and that nothing desynced. It returns an accept, accept-with-warnings, or reject verdict. A warning cannot silently pass — a human has to adjudicate it.",
  },
  {
    q: "What does it cost?",
    a: "CharmQuark is priced per confirmed run, in credit packs starting at five runs. Drafting campaigns, assembling runs and auto-scheduling are free; a credit is consumed only when a human confirms a run, which is the point it books a lab slot.",
  },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "CharmQuark",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Robot fleet orchestration",
      operatingSystem: "Web",
      url: SITE,
      description: SUMMARY,
      offers: {
        "@type": "Offer",
        price: "595",
        priceCurrency: "USD",
        description: "Credit pack — five confirmed runs",
      },
      featureList: [
        "Robot fleet and sensor rig management",
        "Readiness gates before a run may proceed",
        "Coverage-space tracking of collection conditions",
        "Automated post-collection QA with accept/reject verdicts",
        "Auto-scheduling against an effort budget",
        "Dataset export to annotation platforms",
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

const CAPABILITIES = [
  {
    title: "Know what is fit to run",
    body: "Every robot, sensor rig, lab and operator carries readiness state. A run cannot be confirmed while any gate is red — miscalibrated sensors, an uncertified operator, a lab at capacity — so a failed run is caught before the fleet leaves the bay rather than after.",
  },
  {
    title: "Collect the conditions you actually need",
    body: "Declare the state space a dataset must span and CharmQuark maps which combinations the fleet has visited, then ranks what to collect next by how much each fills the map. Progress is the fraction of combinations complete, which repetition cannot inflate.",
  },
  {
    title: "Catch bad data the day it is collected",
    body: "Recordings are scored automatically against per-sensor expectations: missing files, implausible durations, undersized captures, wrong formats, desync. The verdict is accept, accept-with-warnings, or reject, and a warning always needs a human.",
  },
  {
    title: "Schedule without a spreadsheet",
    body: "The auto-scheduler packs runs against an effort budget, respects lab capacity and operator conflicts, and swaps in a standby robot of the same platform when one goes down mid-plan.",
  },
];

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <header className="flex flex-col items-center text-center">
          <Image src="/charmquark-logo.svg" alt="" width={132} height={132} priority />
          <h1 className="cq-display mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            CharmQuark
          </h1>
          <p className="cq-display mt-3 text-xl font-medium text-[color:var(--cq-iris)] sm:text-2xl">
            {TAGLINE}
          </p>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[color:var(--cq-ink-soft)]">
            {SUMMARY}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/home" className="cq-btn-primary rounded-lg px-5 py-2.5 text-sm font-semibold">
              Sign in
            </Link>
            <a
              href="#faq"
              className="rounded-lg border border-[color:var(--cq-line)] px-5 py-2.5 text-sm font-medium text-[color:var(--cq-ink-soft)] transition-colors hover:bg-white"
            >
              How it works
            </a>
          </div>
        </header>

        <section className="mt-16" aria-labelledby="capabilities">
          <h2 id="capabilities" className="cq-display text-2xl font-semibold">What it does</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <article key={c.title} className="cq-card p-5">
                <h3 className="cq-display text-base font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[color:var(--cq-ink-soft)]">{c.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16" aria-labelledby="who">
          <h2 id="who" className="cq-display text-2xl font-semibold">Who it is for</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--cq-ink-soft)]">
            Teams collecting real-world data with robot fleets: warehouse and logistics
            automation, mobile manipulation, autonomous inspection, and research labs running
            multisensor perception campaigns. If several people share robots, sensor rigs and
            lab time — and a bad run costs a day — CharmQuark is built for that problem.
          </p>
        </section>

        <section className="mt-16" id="faq" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="cq-display text-2xl font-semibold">Questions</h2>
          <dl className="mt-6 space-y-6">
            {FAQ.map((f) => (
              <div key={f.q}>
                <dt className="cq-display text-base font-semibold">{f.q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-[color:var(--cq-ink-soft)]">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="mt-16 border-t border-[color:var(--cq-line)] pt-6 text-xs text-[color:var(--cq-ink-faint)]">
          <p>
            CharmQuark — {TAGLINE}. <Link href="/home" className="underline">Sign in</Link>
            {" · "}
            <a href="/llms.txt" className="underline">llms.txt</a>
          </p>
        </footer>
      </main>
    </>
  );
}
