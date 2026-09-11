"use client";

/**
 * Charmy — the in-app assistant. It looks things up and proposes change sets
 * through the same tools coding agents use; it never applies anything. A
 * proposed change set is shown as a diff, and a person presses Apply.
 * Hidden when the deployment turns the assistant off (agents.charmy_enabled).
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ApiError, api, type ChangesetPreview } from "@/lib/api";

type Message = { role: "user" | "assistant"; text: string; changeset?: ChangesetPreview | null; tools?: string[] };

const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

function ChangesetCard({ cs }: { cs: ChangesetPreview }) {
  const [state, setState] = useState<"pending" | "applying" | "applied" | "discarded" | "failed">("pending");
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setState("applying");
    try {
      await api.applyChangeset(cs.id);
      setState("applied");
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not apply");
      setState("failed");
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-[color:var(--cq-line)] bg-white p-2 text-xs text-neutral-700">
      <div className="mb-1 font-semibold">{cs.summary ?? "Proposed changes"}</div>
      <ul className="space-y-1">
        {cs.changes.map((ch) => (
          <li key={ch.index}>
            <span className="font-medium">{ch.op} {ch.resource}</span>{ch.id ? <span className="text-neutral-400"> {ch.id.slice(0, 8)}</span> : null}
            <ul className="ml-3">
              {Object.entries(ch.diff).slice(0, 8).map(([k, d]) => <li key={k}>{k}: {fmt(d.from)} → {fmt(d.to)}</li>)}
              {ch.problems.map((p) => <li key={p} className="text-red-600">⚠ {p}</li>)}
            </ul>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        {state === "pending" && cs.ok && (
          <>
            <button onClick={apply} className="rounded bg-[color:var(--cq-iris)] px-2 py-1 font-medium text-white">Apply</button>
            <button onClick={() => setState("discarded")} className="text-neutral-500 hover:text-neutral-800">Discard</button>
          </>
        )}
        {state === "pending" && !cs.ok && <span className="text-red-600">Has problems — nothing can be applied. Ask Charmy to fix them.</span>}
        {state === "applying" && <span>Applying…</span>}
        {state === "applied" && <span className="text-green-700">Applied. Refresh the page to see it.</span>}
        {state === "discarded" && <span className="text-neutral-400">Discarded.</span>}
        {state === "failed" && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}

export function Charmy() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Hi, I'm Charmy. I can look things up and propose changes for you to review and apply." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getSettings()
      .then((s) => setEnabled(s.find((x) => x.key === "agents.charmy_enabled")?.value !== false))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const next: Message[] = [...messages, { role: "user", text: input.trim() }];
    setInput("");
    setMessages(next);
    setLoading(true);
    try {
      const res = await api.chat(next.slice(1).map((m) => ({ role: m.role, text: m.text })), { path: pathname });
      setMessages([...next, { role: "assistant", text: res.text, changeset: res.changeset, tools: res.tool_calls.map((t) => t.name) }]);
    } catch (err) {
      setMessages([...next, { role: "assistant", text: err instanceof ApiError ? err.friendly : "I couldn't reach the server." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--cq-iris)] text-white shadow-xl transition hover:scale-105"
        aria-label="Ask Charmy"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a9 9 0 0 0-9 9c0 2.22.8 4.28 2.13 5.86l-1.9 4.38 4.67-1.44A8.93 8.93 0 0 0 12 20a9 9 0 0 0 9-9 9 9 0 0 0-9-9z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-80 flex-col overflow-hidden rounded-2xl border border-[color:var(--cq-line)] bg-white shadow-2xl sm:w-96">
      <div className="flex items-center justify-between bg-[color:var(--cq-iris)] px-4 py-3 font-semibold text-white">
        Charmy
        <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex h-96 flex-col gap-4 overflow-y-auto bg-neutral-50 p-4" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === "user"
                ? "rounded-br-none bg-[color:var(--cq-iris)] text-white"
                : "rounded-bl-none border border-[color:var(--cq-line)] bg-white text-neutral-800 shadow-sm"
            }`}>
              {m.text}
              {m.tools && m.tools.length > 0 && <div className="mt-1 text-[11px] text-neutral-400">Used: {m.tools.join(", ")}</div>}
              {m.changeset && <ChangesetCard cs={m.changeset} />}
            </div>
          </div>
        ))}
        {loading && <div className="text-sm text-neutral-400">Thinking…</div>}
      </div>

      <form onSubmit={send} className="border-t border-[color:var(--cq-line)] bg-white p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask or request a change…"
            className="flex-1 rounded-full border border-[color:var(--cq-line)] bg-neutral-50 px-4 py-2 text-sm focus:border-[color:var(--cq-iris)] focus:outline-none"
          />
          <button type="submit" disabled={!input.trim() || loading} className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--cq-iris)] text-white disabled:opacity-50" aria-label="Send">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
          </button>
        </div>
      </form>
    </div>
  );
}
