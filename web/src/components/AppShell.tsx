"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { hasOnboarded } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import { Login } from "./Login";
import { Onboarding } from "./Onboarding";
import { Sidebar } from "./Sidebar";
import { Charmy } from "./Charmy";

/**
 * Routes served without the app chrome or a login gate.
 *
 * The product itself sits behind Cloudflare Access, which means a crawler — or
 * an AI assistant answering a question about CharmQuark — sees a login redirect
 * and nothing else. These paths are the public surface that makes the product
 * discoverable at all, so they must render for an anonymous visitor.
 */
const PUBLIC_ROUTES = new Set(["/"]);

/** Gates the app behind login; shows the onboarding wizard on first login per user. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useUser();
  const [showOnboard, setShowOnboard] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const sync = () => setShowOnboard(!!user && !hasOnboarded(user));
    sync();
    window.addEventListener("charmquark-onboard-changed", sync);
    return () => window.removeEventListener("charmquark-onboard-changed", sync);
  }, [user]);

  // Close mobile menu automatically when the user navigates
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Public pages render bare: no rail, no login, no onboarding.
  if (PUBLIC_ROUTES.has(pathname)) return <>{children}</>;

  if (!user) return <Login />;

  return (
    <div className="flex h-screen overflow-hidden flex-col md:flex-row bg-neutral-50">
      
      {/* Mobile Top Header (Visible only on small screens) */}
      <div className="md:hidden flex items-center justify-between bg-[color:var(--cq-ink)] px-4 py-3 text-white z-40 relative">
        <div className="flex items-center gap-3">
          <div className="rounded bg-white p-1">
            <Image src="/cq-logo.png" width={24} height={24} alt="CQ" />
          </div>
          <span className="font-semibold text-sm tracking-widest">CHARMQUARK</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-3 -mr-3" aria-label="Open menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* Sidebar Navigation (Desktop + Mobile Drawer) */}
      <div 
        className={`fixed inset-0 z-50 flex transform transition-transform duration-200 ease-in-out md:relative md:transform-none ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Sidebar />
        
        {/* Backdrop for mobile drawer */}
        {isMobileMenuOpen && (
          <div 
            className="flex-1 bg-black/60 md:hidden backdrop-blur-sm" 
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Main App Content Area */}
      <main className="flex-1 overflow-y-auto md:overflow-hidden relative z-0">
        {children}
      </main>

      {showOnboard && <Onboarding user={user} onDone={() => setShowOnboard(false)} />}
      <Charmy />
    </div>
  );
}
