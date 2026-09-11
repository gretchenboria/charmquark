import Link from "next/link";
import Image from "next/image";

const TAGLINE = "Enterprise Fleet Orchestration";
const SUMMARY = "How CharmQuark applies rigid, enterprise-grade ontology and lifecycles to RobotOps data collection.";

export const metadata = {
  title: `CharmQuark — ${TAGLINE}`,
  description: SUMMARY,
};

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <header className="flex flex-col items-center text-center">
        <Image src="/cq-logo.png" alt="CharmQuark" width={132} height={132} priority />
        <h1 className="cq-display mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
          CharmQuark
        </h1>
        <p className="mt-5 max-w-3xl text-[17px] leading-relaxed text-[color:var(--cq-ink-soft)]">
          Inspired by enterprise compliance systems like Veeva Vault, CharmQuark brings strict ontology, state-driven lifecycles, and zero-trust security to robotic fleet operations.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/home" className="cq-btn-primary rounded-lg px-6 py-3 text-sm font-semibold shadow-md">
            Sign in to Workspace
          </Link>
          <a
            href="#problem"
            className="rounded-lg border border-[color:var(--cq-line)] px-6 py-3 text-sm font-medium text-[color:var(--cq-ink-soft)] transition-colors hover:bg-neutral-50"
          >
            See how it works
          </a>
        </div>
      </header>

      <div className="mt-16 w-full overflow-hidden rounded-xl border border-neutral-200 shadow-2xl">
        <Image 
          src="/screenshot-dashboard.png" 
          alt="CharmQuark Dashboard" 
          width={1920} 
          height={1080} 
          className="w-full object-cover"
        />
      </div>

      <section className="mt-24" id="problem" aria-labelledby="the-problem">
        <h2 id="the-problem" className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">1. The Problem</h2>
        <div className="mt-6 text-[16px] leading-relaxed text-[color:var(--cq-ink-soft)] space-y-4 max-w-3xl">
          <p>
            Robot Operations (RobotOps) teams scale by collecting massive amounts of real-world data to train ML models. But as fleets grow, teams hit a wall: <strong>garbage in, garbage out</strong>.
          </p>
          <ul className="list-disc pl-5 space-y-3">
            <li><strong>Unstructured Instructions:</strong> Operators use Slack or Google Docs for mission instructions, leading to missed steps and inconsistent data.</li>
            <li><strong>Silent Failures:</strong> A sensor gets unplugged, but the operator completes the run. The ML team finds out weeks later that the data is useless.</li>
            <li><strong>Missing Negative Data:</strong> Operators try to succeed. ML models never learn what hardware faults or edge-case failures look like because no one intentionally records them.</li>
            <li><strong>Lack of Lineage:</strong> When bad data poisons a model, there is no audit trail tying the dataset back to the specific robot calibration, software version, or operator.</li>
          </ul>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="the-solution">
        <h2 id="the-solution" className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">2. The Solution: Ontology & Lifecycles</h2>
        <div className="mt-6 text-[16px] leading-relaxed text-[color:var(--cq-ink-soft)] space-y-4 max-w-3xl">
          <p>
            CharmQuark solves this by treating every component (Robots, Sensors, Missions, Runs) as a rigidly versioned entity with strict lifecycles.
          </p>
          <ul className="list-disc pl-5 space-y-3">
            <li><strong>Strong Ontology:</strong> A &quot;Mission&quot; isn&apos;t free text. It is a structured object linked relationally to specific Inventory, Safety Hazards, and Execution Variants.</li>
            <li><strong>State-Driven QA Gates:</strong> A run cannot transition from <code>SCHEDULED</code> to <code>CONFIRMED</code> without legal sign-off. It cannot move to <code>EXPORTED</code> without human QA approval.</li>
            <li><strong>Agentic Variant Generation:</strong> Built-in AI autonomously breaks down standard missions into structured &quot;Negative Examples&quot; (e.g., E1: Sensor Glare, E2: Hardware Fault) to force operators to collect ML failure edge cases.</li>
          </ul>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="workflows">
        <h2 id="workflows" className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">3. Immutable Workflow</h2>
        <div className="mt-8 rounded-xl border border-[color:var(--cq-line)] bg-neutral-50 p-8 overflow-x-auto shadow-inner">
          <pre className="text-sm font-mono text-[color:var(--cq-ink-soft)] leading-loose">
{`[ CAMPAIGN PLANNING ]
      │
      ├─> (AI Agent) Generates Mission Variants (E1, E2 edge cases)
      │
      ▼
[ LEGAL & SAFETY REVIEW ] ── (Blocked if High Risk) ──> [ FLEET LEAD APPROVAL ]
      │
      ▼
[ SCHEDULING ALGORITHM ] ── (Checks Robot Calibration & Lab Capacity)
      │
      ▼
[ RUN EXECUTION ] ── (Operator completes Run & logs exact Variant code)
      │
      ▼
[ QA AUTO-CHECK ] ── (Rejects missing files/desync) ──> [ HUMAN ADJUDICATION ]
      │
      ▼
[ ML DATA EXPORT ] ── (Only pushes pristine, QA-passed data to pipeline)`}
          </pre>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="results">
        <h2 id="results" className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">4. Expected Results</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="cq-card p-6 shadow-md">
            <h3 className="font-semibold text-lg text-[color:var(--cq-ink)]">Zero Wasted Annotation</h3>
            <p className="mt-3 text-sm text-[color:var(--cq-ink-soft)] leading-relaxed">By gating exports behind QA, ML teams never pay to label occluded or incomplete data.</p>
          </div>
          <div className="cq-card p-6 shadow-md">
            <h3 className="font-semibold text-lg text-[color:var(--cq-ink)]">Full Traceability</h3>
            <p className="mt-3 text-sm text-[color:var(--cq-ink-soft)] leading-relaxed">Every data frame exported has an unbroken lineage to the exact robot, calibration state, and operator.</p>
          </div>
          <div className="cq-card p-6 shadow-md">
            <h3 className="font-semibold text-lg text-[color:var(--cq-ink)]">Robust Edge Cases</h3>
            <p className="mt-3 text-sm text-[color:var(--cq-ink-soft)] leading-relaxed">AI-generated task variations force the collection of negative examples, drastically improving ML resilience.</p>
          </div>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="developer-api">
        <h2 id="developer-api" className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">5. Developer Integration</h2>
        <div className="mt-6 text-[16px] leading-relaxed text-[color:var(--cq-ink-soft)] space-y-4 max-w-3xl">
          <p>
            CharmQuark is built for headless enterprise integration. The platform provides a comprehensive, secure REST API that allows your internal tools to orchestrate fleets programmatically.
          </p>
          <p>
            The authorization matrix is centrally defined, meaning third-party service accounts can be safely granted strict execution rights to automatically log runs via webhooks without exposing planning rights.
          </p>
        </div>
      </section>

      <footer className="mt-24 border-t border-[color:var(--cq-line)] pt-8 text-center text-sm text-[color:var(--cq-ink-faint)]">
        <p>CharmQuark: Enterprise Fleet Orchestration</p>
        <div className="mt-4 flex justify-center gap-6">
          <Link href="/home" className="hover:underline font-medium">App Dashboard</Link>
          <a href="/llms.txt" className="hover:underline font-medium">llms.txt</a>
        </div>
      </footer>
    </main>
  );
}
