"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";

type Message = { role: "user" | "model"; text: string };

export function Charmy() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "model", text: "Hi! I'm Charmy, your CharmQuark wizard guide. How can I help you orchestrate your fleet today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    const newMessages: Message[] = [...messages, { role: "user", text: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const payload = newMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const res = await api.chat(payload);
      setMessages([...newMessages, { role: "model", text: res.text }]);
    } catch (err) {
      setMessages([...newMessages, { role: "model", text: "Oops, my connection to the magic weave failed. (Is the backend reachable?)" }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--cq-iris)] text-white shadow-xl transition hover:scale-105 z-50"
        aria-label="Ask Charmy"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a9 9 0 0 0-9 9c0 2.22.8 4.28 2.13 5.86l-1.9 4.38 4.67-1.44A8.93 8.93 0 0 0 12 20a9 9 0 0 0 9-9 9 9 0 0 0-9-9z"></path>
          <path d="M9.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"></path>
          <path d="M14.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"></path>
          <path d="M15 14c0 1.5-1.5 2-3 2s-3-.5-3-2"></path>
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-80 flex-col overflow-hidden rounded-2xl border border-[color:var(--cq-line)] bg-white shadow-2xl sm:w-96">
      <div className="flex items-center justify-between bg-[color:var(--cq-iris)] px-4 py-3 text-white">
        <div className="flex items-center gap-2 font-semibold">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a9 9 0 0 0-9 9c0 2.22.8 4.28 2.13 5.86l-1.9 4.38 4.67-1.44A8.93 8.93 0 0 0 12 20a9 9 0 0 0 9-9 9 9 0 0 0-9-9z"></path>
          </svg>
          Charmy
        </div>
        <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"></path></svg>
        </button>
      </div>
      
      <div className="flex h-96 flex-col gap-4 overflow-y-auto p-4 bg-neutral-50" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === "user" 
                ? "bg-[color:var(--cq-iris)] text-white rounded-br-none" 
                : "bg-white border border-[color:var(--cq-line)] text-neutral-800 rounded-bl-none shadow-sm"
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl bg-white px-4 py-2.5 text-sm text-neutral-400 border border-[color:var(--cq-line)] rounded-bl-none shadow-sm flex gap-1 items-center">
              <span className="animate-bounce">.</span><span className="animate-bounce delay-100">.</span><span className="animate-bounce delay-200">.</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={send} className="border-t border-[color:var(--cq-line)] bg-white p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Charmy..."
            className="flex-1 rounded-full border border-[color:var(--cq-line)] bg-neutral-50 px-4 py-2 text-sm focus:border-[color:var(--cq-iris)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--cq-iris)] text-white disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z"></path>
              <path d="M22 2 11 13"></path>
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
