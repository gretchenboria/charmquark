import Link from "next/link";
import Image from "next/image";

const TAGLINE = "Single-Tenant ROS2 Command & Control";
const SUMMARY = "The ultimate platform for Robot Operations. We bring strict data models, live WebSocket telemetry, and hardware-level execution to your physical assets.";

export const metadata = {
  title: `CharmQuark — ${TAGLINE}`,
  description: SUMMARY,
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[color:var(--cq-plum)] text-white selection:bg-[color:var(--cq-iris)] overflow-hidden">
      {/* Background gradients: The Aurora */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[800px] opacity-40 pointer-events-none">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-gradient-to-br from-[color:var(--cq-violet)] to-[color:var(--cq-blue)] blur-[120px]"></div>
      </div>

      <nav className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Image src="/charmquark-wordmark-light.svg" alt="CharmQuark Logo" width={200} height={40} className="h-8 w-auto" />
        </div>
        <Link href="/home" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
          C2 Dashboard
        </Link>
      </nav>

      <header className="relative z-10 flex flex-col items-center text-center pt-32 pb-24 px-6 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/20 border border-white/10 text-sm font-medium text-[color:var(--cq-sage)] mb-8 backdrop-blur-md">
          <span className="flex h-2 w-2 rounded-full bg-[color:var(--cq-sage)]"></span>
          Live WebSocket Telemetry Enabled
        </div>
        
        <h1 className="cq-display text-5xl sm:text-7xl font-bold tracking-tight mb-8">
          Single-Tenant ROS2 <br />
          Command & Control.
        </h1>
        
        <p className="max-w-2xl text-xl text-white/70 leading-relaxed mb-12">
          The perpetual-license orchestrator for physical hardware. Stream live telemetry from the edge and trigger instantaneous E-Stops across your entire fleet.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link 
            href="/home" 
            className="cq-btn-primary px-8 py-4 rounded-xl text-white font-medium text-lg transition-all"
            style={{ background: "linear-gradient(135deg, var(--cq-violet), var(--cq-blue))" }}
          >
            Deploy Dashboard
          </Link>
        </div>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pb-32">
        <section className="mb-32">
          <div className="text-center mb-16">
            <h2 className="cq-display text-4xl font-semibold mb-6">Hardware Execution & Telemetry</h2>
            <p className="text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
              Our ROS2 Python daemon bridges the gap between cloud coordination and physical execution, providing zero-trust secure communication to the edge.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 hover:border-white/20 transition-all duration-300">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[color:var(--cq-violet)] to-[color:var(--cq-blue)] flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h3 className="cq-display text-2xl font-semibold mb-3 text-white">Live Telemetry</h3>
              <p className="text-white/70 leading-relaxed">
                Connect your physical robots to the cloud via WebSockets. Monitor active states, battery levels, and diagnostics in real-time with sub-second latency.
              </p>
            </div>
            
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 hover:border-white/20 transition-all duration-300">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[color:var(--cq-rose)] to-red-600 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h3 className="cq-display text-2xl font-semibold mb-3 text-white">Instant E-Stops</h3>
              <p className="text-white/70 leading-relaxed">
                A single click in the C2 Dashboard publishes a zeroed-out Twist message to local <code className="text-sm bg-black/30 px-1 py-0.5 rounded text-[color:var(--cq-rose)]">/cmd_vel</code> topics, halting your hardware instantly.
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 hover:border-white/20 transition-all duration-300">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[color:var(--cq-sage)] to-green-600 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h3 className="cq-display text-2xl font-semibold mb-3 text-white">Zero-Trust Security</h3>
              <p className="text-white/70 leading-relaxed">
                Every API call and telemetry message is strongly authenticated. Roles and permissions are strictly enforced before any command reaches your fleet.
              </p>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[2.5rem] bg-black/40 border border-white/10 p-12 md:p-24 text-center mt-20 backdrop-blur-md">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-[800px] bg-gradient-to-tr from-[color:var(--cq-violet)] to-[color:var(--cq-blue)] opacity-20 blur-[120px] rounded-full pointer-events-none"></div>
          <div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center">
            <h2 className="cq-display text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">
              Stop guessing. Start orchestrating.
            </h2>
            <p className="text-xl text-white/60 mb-10 leading-relaxed">
              Ditch the complex patchwork of bespoke ROS nodes. Implement structured data models, automated QA gates, and rigid lifecycles today.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <Link 
                href="/home" 
                className="w-full sm:w-auto px-10 py-5 bg-white text-[color:var(--cq-plum)] font-bold rounded-2xl hover:bg-white/90 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-105"
              >
                Launch Dashboard
              </Link>
              <Link 
                href="/docs" 
                className="w-full sm:w-auto px-10 py-5 bg-white/5 text-white font-medium rounded-2xl border border-white/10 hover:bg-white/10 transition-all hover:scale-105"
              >
                Read Documentation
              </Link>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-white/10 bg-black/40 py-12 px-6 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/50 font-medium">© 2026 CharmQuark Inc.</span>
          </div>
          <div className="flex gap-6 text-sm text-white/50">
            <Link href="/home" className="hover:text-white transition-colors">C2 Dashboard</Link>
            <Link href="/docs" className="hover:text-white transition-colors">Documentation</Link>
            <Link href="/tutorial" className="hover:text-white transition-colors">Tutorial</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
