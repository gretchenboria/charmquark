"use client";

import { useEffect, useState, type ReactNode } from "react";
import { hasOnboarded } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import { Login } from "./Login";
import { Onboarding } from "./Onboarding";
import { Sidebar } from "./Sidebar";

/** Gates the app behind login; shows the onboarding wizard on first login per user. */
export function AppShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const [showOnboard, setShowOnboard] = useState(false);

  useEffect(() => {
    const sync = () => setShowOnboard(!!user && !hasOnboarded(user));
    sync();
    window.addEventListener("charmquark-onboard-changed", sync);
    return () => window.removeEventListener("charmquark-onboard-changed", sync);
  }, [user]);

  if (!user) return <Login />;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
      {showOnboard && <Onboarding user={user} onDone={() => setShowOnboard(false)} />}
    </div>
  );
}
