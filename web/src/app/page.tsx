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
            <h2 className="cq-display text-3xl font-semibold mb-4">Hardware Execution</h2>
            <p className="text-lg text-white/60 max-w-2xl mx-auto">
              Our ROS2 Python daemon bridges the gap between cloud coordination and physical execution.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="cq-card bg-[color:var(--cq-plum)] border border-white/10 rounded-2xl p-8 hover:bg-white/5 transition-colors">
              <h3 className="cq-display text-2xl font-semibold mb-3 text-white">Live Telemetry</h3>
              <p className="text-white/60 leading-relaxed">
                Connect your physical robots to the cloud via WebSockets. Monitor active states, battery levels, and diagnostics in real-time.
              </p>
            </div>
            <div className="cq-card bg-[color:var(--cq-plum)] border border-white/10 rounded-2xl p-8 hover:bg-white/5 transition-colors">
              <h3 className="cq-display text-2xl font-semibold mb-3 text-white">Instant E-Stops</h3>
              <p className="text-white/60 leading-relaxed">
                A single click in the C2 Dashboard publishes a zeroed-out Twist message to local `/cmd_vel` topics, halting your hardware instantly.
              </p>
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
