import Link from "next/link";
import Image from "next/image";

const TAGLINE = "Single-Tenant ROS2 Command & Control Center";
const SUMMARY = "CharmQuark is the ultimate Command & Control orchestrator for your physical robotic fleets, combining live WebSocket telemetry with immediate edge execution.";

export const metadata = {
  title: `CharmQuark — ${TAGLINE}`,
  description: SUMMARY,
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-white selection:bg-red-500/30 overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[800px] opacity-20 pointer-events-none">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-gradient-to-b from-red-600 to-black blur-[120px]"></div>
      </div>

      <nav className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Image src="/cq-logo.png" alt="CharmQuark Logo" width={48} height={48} className="rounded-md grayscale contrast-125" />
          <span className="font-bold text-2xl tracking-tighter uppercase tracking-widest text-zinc-100">CharmQuark</span>
        </div>
        <Link href="/home" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
          C2 Dashboard Login
        </Link>
      </nav>

      <header className="relative z-10 flex flex-col items-center text-center pt-32 pb-24 px-6 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-950/30 border border-red-500/20 text-xs font-bold tracking-widest text-red-400 mb-8 backdrop-blur-sm uppercase">
          <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
          Live WebSocket Telemetry Enabled
        </div>
        
        <h1 className="text-6xl sm:text-8xl font-black tracking-tighter mb-8 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent uppercase">
          Command &<br className="hidden sm:block" />
          Control.
        </h1>
        
        <p className="max-w-2xl text-xl sm:text-2xl text-zinc-400 leading-relaxed mb-12 font-medium">
          The single-tenant, perpetual-license orchestrator for ROS2 hardware. Stream live telemetry from the edge and trigger instantaneous E-Stops across your entire physical fleet.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 relative z-20">
          <Link 
            href="/home" 
            className="px-10 py-5 rounded-none bg-red-600 text-white font-bold tracking-widest uppercase hover:bg-red-500 transition-all shadow-[0_0_30px_rgba(220,38,38,0.4)] hover:scale-105"
          >
            Deploy Dashboard
          </Link>
        </div>
      </header>

      <section className="relative z-10 px-6 max-w-7xl mx-auto mb-32">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-zinc-900/50 border border-white/5 p-8 backdrop-blur-sm hover:border-red-500/30 transition-colors">
            <h3 className="text-red-500 font-mono text-sm mb-4 uppercase tracking-widest">01 / Architecture</h3>
            <h4 className="text-2xl font-bold mb-4">Single-Tenant Enterprise Security</h4>
            <p className="text-zinc-400">Forget SaaS. CharmQuark is deployed as a single-tenant instance behind a perpetual software license. Your telemetry, your hardware, zero shared infrastructure.</p>
          </div>
          <div className="bg-zinc-900/50 border border-white/5 p-8 backdrop-blur-sm hover:border-red-500/30 transition-colors">
            <h3 className="text-red-500 font-mono text-sm mb-4 uppercase tracking-widest">02 / Edge Agent</h3>
            <h4 className="text-2xl font-bold mb-4">Native ROS2 Python Daemon</h4>
            <p className="text-zinc-400">The edge client runs directly on your robots via <code className="text-zinc-300">ament_python</code>. It opens a persistent WebSocket to stream hardware states like battery and health directly into the cloud C2 interface.</p>
          </div>
          <div className="bg-zinc-900/50 border border-white/5 p-8 backdrop-blur-sm hover:border-red-500/30 transition-colors">
            <h3 className="text-red-500 font-mono text-sm mb-4 uppercase tracking-widest">03 / Execution</h3>
            <h4 className="text-2xl font-bold mb-4">Instantaneous E-Stops</h4>
            <p className="text-zinc-400">When things go wrong, every millisecond matters. Clicking E-Stop in the web dashboard instantly routes through the WebSocket and publishes a zeroed <code className="text-zinc-300">cmd_vel</code> directly to the local ROS topic.</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-black py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs tracking-widest text-zinc-600 font-mono uppercase">© 2026 CharmQuark Inc. — Single-Tenant License Required</span>
          </div>
          <div className="flex gap-6 text-sm text-zinc-500 font-mono uppercase tracking-widest">
            <Link href="/home" className="hover:text-red-400 transition-colors">C2 Dashboard</Link>
            <Link href="/tutorial" className="hover:text-red-400 transition-colors">Documentation</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
