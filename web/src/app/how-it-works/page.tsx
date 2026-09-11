import Link from "next/link";
import Image from "next/image";

const SUMMARY = "How CharmQuark applies rigid, enterprise-grade ontology and lifecycles to RobotOps data collection.";

export const metadata = {
  title: "How It Works — CharmQuark",
  description: SUMMARY,
};

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
      <header className="flex flex-col items-center text-center">
        <Link href="/">
          <Image src="/cq-logo.png" alt="CharmQuark" width={80} height={80} priority />
        </Link>
        <h1 className="cq-display mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          How It Works
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[color:var(--cq-ink-soft)]">
          Inspired by enterprise document management systems like Veeva Vault, CharmQuark brings strict ontology, state-driven lifecycles, and high configurability to robotic fleet operations.
        </p>
      </header>

      <section className="mt-16" aria-labelledby="the-problem">
        <h2 id="the-problem" className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">1. The Problem</h2>
        <div className="mt-4 text-[15px] leading-relaxed text-[color:var(--cq-ink-soft)] space-y-4">
          <p>
            Robot Operations (RobotOps) teams scale by collecting massive amounts of real-world data to train ML models. But as fleets grow, teams hit a wall: <strong>garbage in, garbage out</strong>.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Unstructured Instructions:</strong> Operators use Slack or Google Docs for mission instructions, leading to missed steps and inconsistent data.</li>
            <li><strong>Silent Failures:</strong> A sensor gets unplugged, but the operator completes the run. The ML team finds out weeks later that the data is useless.</li>
            <li><strong>Missing Negative Data:</strong> Operators try to succeed. ML models never learn what hardware faults or edge-case failures look like because no one intentionally records them.</li>
            <li><strong>Lack of Lineage:</strong> When bad data poisons a model, there is no audit trail tying the dataset back to the specific robot calibration, software version, or operator.</li>
          </ul>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="the-solution">
        <h2 id="the-solution" className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">2. The Solution (Ontology & Lifecycles)</h2>
        <div className="mt-4 text-[15px] leading-relaxed text-[color:var(--cq-ink-soft)] space-y-4">
          <p>
            CharmQuark solves this by treating every component (Robots, Sensors, Missions, Runs) as a rigidly versioned entity with strict lifecycles—similar to a life-sciences compliance vault.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Strong Ontology:</strong> A "Mission" isn't free text. It is a structured object linked relationally to specific Inventory, Safety Hazards, and Execution Variants.</li>
            <li><strong>State-Driven QA Gates:</strong> A run cannot transition from <code>SCHEDULED</code> to <code>CONFIRMED</code> without legal sign-off. It cannot move to <code>EXPORTED</code> without human QA approval.</li>
            <li><strong>Agentic Variant Generation:</strong> Cloudflare Workers AI autonomously breaks down standard missions into structured "Negative Examples" (e.g., E1: Sensor Glare, E2: Hardware Fault) to force operators to collect ML failure edge cases.</li>
          </ul>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="workflows">
        <h2 id="workflows" className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">3. Sample Workflow</h2>
        <div className="mt-6 rounded-lg border border-[color:var(--cq-line)] bg-neutral-50 p-6 overflow-x-auto">
          <pre className="text-sm font-mono text-[color:var(--cq-ink-soft)]">
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
[ ROBOFLOW EXPORT ] ── (Only pushes pristine, QA-passed data to ML pipeline)`}
          </pre>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="results">
        <h2 id="results" className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">4. Expected Results</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="cq-card p-5">
            <h3 className="font-semibold text-[color:var(--cq-ink)]">Zero Wasted Annotation</h3>
            <p className="mt-2 text-sm text-[color:var(--cq-ink-soft)]">By gating Roboflow exports behind QA, ML teams never pay to label occluded or incomplete data.</p>
          </div>
          <div className="cq-card p-5">
            <h3 className="font-semibold text-[color:var(--cq-ink)]">Full Traceability</h3>
            <p className="mt-2 text-sm text-[color:var(--cq-ink-soft)]">Every data frame exported has an unbroken lineage to the exact robot, calibration state, and operator.</p>
          </div>
          <div className="cq-card p-5">
            <h3 className="font-semibold text-[color:var(--cq-ink)]">Robust Edge Cases</h3>
            <p className="mt-2 text-sm text-[color:var(--cq-ink-soft)]">AI-generated task variations force the collection of negative examples, drastically improving ML resilience.</p>
          </div>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="tech-stack">
        <h2 id="tech-stack" className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">5. Tech Stack & Architecture</h2>
        <div className="mt-4 text-[15px] leading-relaxed text-[color:var(--cq-ink-soft)] space-y-4">
          <p>
            CharmQuark is a serverless edge application deployed globally via <strong>Cloudflare</strong>.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Frontend:</strong> Next.js (React 19), Tailwind CSS, deployed via OpenNext to Cloudflare Workers.</li>
            <li><strong>Backend API:</strong> Hono.js on Cloudflare Workers (V8 Isolate runtime for 0ms cold starts).</li>
            <li><strong>Database (D1):</strong> Distributed SQLite for strictly normalized, relational ontology.</li>
            <li><strong>Blob Storage (R2):</strong> Vault for run sheets, telemetry, and media.</li>
            <li><strong>AI:</strong> Native Cloudflare Workers AI (Llama 3 8B) for risk assessment and variant generation.</li>
          </ul>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="developer-api">
        <h2 id="developer-api" className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">6. Developer Documentation (API)</h2>
        <div className="mt-4 text-[15px] leading-relaxed text-[color:var(--cq-ink-soft)] space-y-4">
          <p>
            The CharmQuark API is built for headless integration. Every UI action is backed by a RESTful endpoint accessible via <code>X-CharmQuark-Role</code> headers or Zero Trust tokens.
          </p>
          <div className="rounded border border-[color:var(--cq-line)] bg-neutral-100 p-4 font-mono text-sm overflow-x-auto">
            POST /api/missions/:id/generate-variants<br />
            POST /api/missions/:id/assess-risk<br />
            POST /api/runs/:id/roboflow/export<br />
            GET  /api/campaigns/:id/coverage
          </div>
          <p>
            The authorization matrix is centrally defined, meaning third-party service accounts can be safely granted <code>ROBOT_OPERATOR</code> rights to automatically log runs via webhooks without exposing planning rights.
          </p>
        </div>
      </section>

      <footer className="mt-16 border-t border-[color:var(--cq-line)] pt-6 text-center text-xs text-[color:var(--cq-ink-faint)]">
        <p>CharmQuark: Enterprise Fleet Orchestration</p>
        <div className="mt-4 flex justify-center gap-4">
          <Link href="/" className="hover:underline">Home</Link>
          <Link href="/home" className="hover:underline">App Dashboard</Link>
        </div>
      </footer>
    </main>
  );
}
