"use client";

import Image from "next/image";
import { PRESET_USERS, ROLE_LABEL, setUser } from "@/lib/session";

export function Login() {
  return (
    <div className="flex h-screen items-center justify-center bg-neutral-50">
      <div className="w-[420px] rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex flex-col items-center gap-4">
            <Image src="/cq-logo.png" alt="" width={200} height={200} priority />
            <span className="cq-display text-3xl font-bold uppercase tracking-[0.22em] text-[color:var(--cq-iris)]">
              CharmQuark
            </span>
          </div>
          <div className="text-xs text-neutral-400">AIML DataOps · Scheduling</div>
        </div>
        <p className="mb-4 text-sm text-neutral-500">Sign in as:</p>
        <div className="flex flex-col gap-2">
          {PRESET_USERS.map((u) => (
            <button
              key={u.name}
              onClick={() => setUser(u)}
              className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3 text-left transition hover:border-neutral-400 hover:bg-neutral-50"
            >
              <div>
                <div className="text-sm font-medium text-neutral-900">{u.name}</div>
                <div className="text-xs text-neutral-500">{u.title}</div>
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                {ROLE_LABEL[u.role]}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-5 text-xs text-neutral-400">
          Tip: open a second browser tab and sign in as a different user to see simultaneous
          multi-user access.
        </p>
        <div className="mt-8 flex items-center justify-center gap-2 border-t border-neutral-100 pt-6 text-xs text-neutral-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          Protected by Cloudflare Zero Trust
        </div>
      </div>
    </div>
  );
}
