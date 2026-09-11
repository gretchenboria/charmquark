"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

export default function IntegrationsPage() {
  const [configured, setConfigured] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Roboflow state
  const [rfKey, setRfKey] = useState("");
  const [savingRf, setSavingRf] = useState(false);

  useEffect(() => {
    api.get<{ configured: string[], has_global_roboflow: boolean }>("/integrations")
      .then(res => {
        setConfigured(res.configured);
      })
      .finally(() => setLoading(false));
  }, []);

  const saveRoboflow = async () => {
    if (!rfKey.trim()) return;
    setSavingRf(true);
    try {
      await api.post("/integrations", { provider: "roboflow", api_key: rfKey.trim() });
      setConfigured(prev => prev.includes("roboflow") ? prev : [...prev, "roboflow"]);
      setRfKey("");
    } catch (e: any) {
      alert(e.friendly || e.message);
    } finally {
      setSavingRf(false);
    }
  };

  const removeRoboflow = async () => {
    if (!confirm("Remove Roboflow integration?")) return;
    try {
      await api.delete("/integrations/roboflow");
      setConfigured(prev => prev.filter(p => p !== "roboflow"));
    } catch (e: any) {
      alert(e.friendly || e.message);
    }
  };

  return (
    <AppShell title="Integrations (BYOK)">
      <div className="mx-auto max-w-3xl py-10 px-8">
        <h1 className="cq-display text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2">Bring Your Own Key (BYOK)</h1>
        <p className="mt-4 text-[15px] text-[color:var(--cq-ink-soft)]">
          CharmQuark securely stores your third-party API keys in an encrypted vault. 
          When you execute runs and export data, the platform acts on your behalf using your own accounts.
        </p>

        {loading ? (
          <div className="mt-12 text-sm text-neutral-500">Loading configurations...</div>
        ) : (
          <div className="mt-12 space-y-8">
            
            {/* Roboflow Integration Card */}
            <div className="rounded-xl border border-[color:var(--cq-line)] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900">Roboflow</h3>
                    <p className="text-sm text-neutral-500">Export QA-passed frames directly to your datasets.</p>
                  </div>
                </div>
                <div>
                  {configured.includes("roboflow") ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                      Configured
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                      Not Configured
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-[color:var(--cq-line)] pt-6">
                {configured.includes("roboflow") ? (
                  <div className="flex items-center justify-between bg-neutral-50 p-4 rounded-lg border border-neutral-100">
                    <div className="text-sm text-neutral-700">
                      <span className="font-medium">API Key:</span> ••••••••••••••••••••
                    </div>
                    <button 
                      onClick={removeRoboflow}
                      className="text-sm font-medium text-red-600 hover:text-red-700"
                    >
                      Remove Key
                    </button>
                  </div>
                ) : (
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label htmlFor="rf-key" className="block text-xs font-medium text-neutral-700 mb-1">Roboflow Private API Key</label>
                      <input
                        id="rf-key"
                        type="password"
                        value={rfKey}
                        onChange={(e) => setRfKey(e.target.value)}
                        placeholder="Paste your Roboflow Private API Key here"
                        className="block w-full rounded-md border border-[color:var(--cq-line)] px-3 py-2 text-sm shadow-sm focus:border-[color:var(--cq-iris)] focus:outline-none focus:ring-1 focus:ring-[color:var(--cq-iris)]"
                      />
                    </div>
                    <button
                      onClick={saveRoboflow}
                      disabled={savingRf || !rfKey.trim()}
                      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {savingRf ? "Saving..." : "Save Key"}
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </AppShell>
  );
}
