import Link from "next/link";
import Image from "next/image";

const TAGLINE = "Enterprise Fleet Orchestration & Resource Management";
const SUMMARY = "CharmQuark is the central platform for RoboOps, applying rigid ontology and lifecycles to hardware management and field execution.";

export const metadata = {
  title: `CharmQuark — ${TAGLINE}`,
  description: SUMMARY,
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-white selection:bg-indigo-500/30 overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[800px] opacity-30 pointer-events-none">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-gradient-to-b from-indigo-500 to-purple-600 blur-[120px]"></div>
      </div>

      <nav className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Image src="/cq-logo.png" alt="CharmQuark Logo" width={32} height={32} className="rounded-md" />
          <span className="font-semibold text-lg tracking-tight">CharmQuark</span>
        </div>
        <Link href="/home" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">
          Sign in
        </Link>
      </nav>

      <header className="relative z-10 flex flex-col items-center text-center pt-24 pb-16 px-6 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-zinc-300 mb-8 backdrop-blur-sm">
          <span className="flex h-2 w-2 rounded-full bg-indigo-500"></span>
          Introducing the future of RoboOps
        </div>
        
        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">
          Rigid Ontology for <br className="hidden sm:block" />
          Physical Execution.
        </h1>
        
        <p className="max-w-2xl text-lg sm:text-xl text-zinc-400 leading-relaxed mb-10">
          The ultimate platform for Robot Operations. We bring strict ontology, state-driven lifecycles, and zero-trust security to your physical assets.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link href="/home" className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-colors shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]">
            Go to Workspace
          </Link>
          <a href="#problem" className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-white/5 border border-white/10 text-white font-medium text-sm hover:bg-white/10 transition-colors backdrop-blur-sm">
            Read the manifesto
          </a>
        </div>
      </header>

      {/* Hero Browser Mockup */}
      <section className="relative z-10 px-6 max-w-6xl mx-auto mb-32">
        <div className="rounded-xl bg-zinc-900/50 border border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden ring-1 ring-white/10">
          {/* Browser Header */}
          <div className="flex items-center px-4 py-3 border-b border-white/10 bg-zinc-900/80">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <div className="mx-auto flex items-center justify-center bg-black/40 rounded-md px-4 py-1 text-xs text-zinc-500 border border-white/5">
              <svg className="w-3 h-3 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              app.charmquark.com
            </div>
          </div>
          {/* Browser Content */}
          <div className="relative aspect-[16/9] w-full">
            <Image 
              src="/hero-screenshot.png" 
              alt="CharmQuark Dashboard" 
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 pb-32 space-y-32">
        {/* Bento Grid: The Problem */}
        <section id="problem" className="scroll-mt-32">
          <div className="flex flex-col gap-3 mb-10">
            <h2 className="text-3xl font-bold tracking-tight">The scaling wall.</h2>
            <p className="text-zinc-400 text-lg max-w-2xl">
              Robot operations scale by collecting massive data. But as fleets grow, teams hit a wall: garbage in, garbage out.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-4">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
              </div>
              <h3 className="font-semibold text-lg text-zinc-100">Unstructured Instructions</h3>
              <p className="text-sm text-zinc-400">Operators use Slack or Docs, leading to missed steps and inconsistent data.</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-4">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h3 className="font-semibold text-lg text-zinc-100">Silent Failures</h3>
              <p className="text-sm text-zinc-400">A sensor gets unplugged, but the operator completes the run. Data becomes useless.</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="font-semibold text-lg text-zinc-100">Missing Negative Data</h3>
              <p className="text-sm text-zinc-400">ML models never learn what hardware faults look like because no one records them.</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h3 className="font-semibold text-lg text-zinc-100">Lack of Lineage</h3>
              <p className="text-sm text-zinc-400">No audit trail tying datasets back to specific robot calibrations or operators.</p>
            </div>
          </div>
        </section>

        {/* Feature List: The Solution */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-6">Ontology & Lifecycles</h2>
            <p className="text-zinc-400 text-lg mb-8">
              CharmQuark solves this by treating every physical asset and field operation as a rigidly versioned entity with strict lifecycles.
            </p>
            <div className="space-y-6">
              {[
                { title: "Complete Resource Management", desc: "Track exact state, location, and health of your physical assets all in one place." },
                { title: "Strong Ontology", desc: "A 'Mission' is a structured object linked relationally to Inventory and Variants." },
                { title: "State-Driven QA Gates", desc: "Rigid transitions from SCHEDULED to CONFIRMED and EXPORTED with approvals." },
                { title: "Agentic Variant Generation", desc: "Built-in AI autonomously forces operators to collect ML failure edge cases." }
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 font-mono text-sm">
                    0{i + 1}
                  </div>
                  <div>
                    <h4 className="text-zinc-100 font-medium mb-1">{item.title}</h4>
                    <p className="text-sm text-zinc-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-zinc-900 rounded-2xl border border-white/10 p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
            <pre className="font-mono text-xs text-zinc-300 leading-loose overflow-x-auto">
{`[ CAMPAIGN PLANNING ]
      │
      ├─> (AI Agent) Generates Mission Variants
      │
      ▼
[ LEGAL & SAFETY ] ──> [ LEAD APPROVAL ]
      │
      ▼
[ SCHEDULING ] ── (Checks Calibration)
      │
      ▼
[ EXECUTION ] ── (Operator logs code)
      │
      ▼
[ QA AUTO-CHECK ] ──> [ HUMAN ADJUDICATION ]
      │
      ▼
[ ROBOFLOW EXPORT ]`}
            </pre>
          </div>
        </section>

        {/* Triple Feature Cards */}
        <section>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight">Expected Results</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-2xl p-8 hover:bg-white/5 transition-colors">
              <h3 className="text-xl font-semibold mb-3 text-white">Zero Wasted Annotation</h3>
              <p className="text-zinc-400 leading-relaxed">By gating exports behind QA, ML teams never pay to label occluded or incomplete data.</p>
            </div>
            <div className="bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-2xl p-8 hover:bg-white/5 transition-colors">
              <h3 className="text-xl font-semibold mb-3 text-white">Full Traceability</h3>
              <p className="text-zinc-400 leading-relaxed">Every data frame exported has an unbroken lineage to the exact robot, calibration state, and operator.</p>
            </div>
            <div className="bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-2xl p-8 hover:bg-white/5 transition-colors">
              <h3 className="text-xl font-semibold mb-3 text-white">Robust Edge Cases</h3>
              <p className="text-zinc-400 leading-relaxed">AI-generated task variations force the collection of negative examples, drastically improving ML resilience.</p>
            </div>
          </div>
        </section>

        {/* Integration Section */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-10 backdrop-blur-sm">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <h3 className="text-2xl font-semibold text-white mb-4">Seamless Roboflow Integration</h3>
            <p className="text-zinc-400 mb-6">
              CharmQuark acts as an elite ML gatekeeper. Once a field run successfully passes strict QA, we programmatically pipe the pristine images directly out of Cloudflare R2 and into your Roboflow datasets.
            </p>
          </div>
          <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-10 backdrop-blur-sm">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
            </div>
            <h3 className="text-2xl font-semibold text-white mb-4">Developer API</h3>
            <p className="text-zinc-400 mb-6">
              Built for headless enterprise integration. The platform provides a comprehensive, secure REST API that allows your internal tools to orchestrate fleets programmatically with granular authorization.
            </p>
          </div>
        </section>
      </div>

      <footer className="border-t border-white/10 bg-black py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Image src="/cq-logo.png" alt="CharmQuark" width={24} height={24} className="rounded opacity-50 grayscale" />
            <span className="text-sm text-zinc-500 font-medium">© 2026 CharmQuark Inc.</span>
          </div>
          <div className="flex gap-6 text-sm text-zinc-500">
            <Link href="/home" className="hover:text-white transition-colors">App Dashboard</Link>
            <a href="#" className="hover:text-white transition-colors">Twitter</a>
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
