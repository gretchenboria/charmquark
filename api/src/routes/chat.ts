/**
 * POST /api/chat — Charmy, the in-app assistant.
 *
 * Model-neutral (Gemini or Anthropic, chosen by the agents.llm_provider setting;
 * key from the Integrations page or a Worker secret). It can read CharmQuark data
 * and propose change sets through the shared tool registry, called as the signed-in
 * user. It never applies changes: a proposed change set comes back to the UI as a
 * diff the person applies or discards.
 */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { AGENT_TOOLS, type ToolCall } from "../agent/tools";
import { runChat, type Transcript } from "../agent/llm";
import { providerFor } from "../llmProvider";
import { loadSettings } from "../settings";

export const chat = new Hono<{ Bindings: Env; Variables: Vars }>();

const FORWARDED = ["Authorization", "X-CharmQuark-Role", "X-CharmQuark-User"];

/** Accept the neutral {role, text} shape, and the older Gemini {role, parts} shape. */
function toTranscript(raw: unknown): Transcript[] {
  if (!Array.isArray(raw)) return [];
  const out: Transcript[] = [];
  for (const m of raw.slice(-20)) {
    if (!m || typeof m !== "object") continue;
    const r = m as { role?: string; text?: string; parts?: { text?: string }[] };
    const text = typeof r.text === "string" ? r.text : (r.parts ?? []).map((p) => p.text ?? "").join("");
    if (!text.trim()) continue;
    out.push(r.role === "user" ? { kind: "user", text } : { kind: "assistant", text, toolUses: [] });
  }
  // A transcript must start with the user.
  while (out.length && out[0]!.kind !== "user") out.shift();
  return out;
}

chat.post("/", async (c) => {
  if (!(await loadSettings(c.env.DB))["agents.charmy_enabled"]) {
    return c.json({ detail: "The assistant is turned off for this deployment (setting agents.charmy_enabled)." }, 404);
  }
  const b = await c.req.json<{ messages?: unknown; context?: { path?: string } }>().catch(() => ({} as { messages?: unknown; context?: { path?: string } }));
  const transcript = toTranscript(b.messages);
  if (!transcript.length) return c.json({ detail: "send at least one user message" }, 400);

  const provider = await providerFor(c.env);
  if (typeof provider === "string") return c.json({ text: provider, changeset: null, tool_calls: [] });

  const p = c.get("principal");
  const system =
    `You are Charmy, the assistant inside CharmQuark, a robot fleet data-collection operations app. ` +
    `You are helping ${p.name} (role ${p.role}). The user is looking at ${b.context?.path ?? "the app"}. ` +
    `Use tools to look things up instead of guessing. To change anything, call propose_changes and then tell the user ` +
    `to review the diff and press Apply — you cannot apply changes and must never say a change is done. ` +
    `Everything you do is limited to what ${p.name}'s role allows. Be concise.`;

  const execute = async (call: ToolCall) => {
    const headers = new Headers({ "Content-Type": "application/json" });
    for (const h of FORWARDED) {
      const v = c.req.header(h);
      if (v) headers.set(h, v);
    }
    for (const [k, v] of Object.entries(call.headers ?? {})) headers.set(k, v);
    const { default: app } = await import("../index");
    const res = await app.fetch(
      new Request(new URL(`/api${call.path}`, c.req.url), { method: call.method, headers, body: call.body === undefined ? undefined : JSON.stringify(call.body) }),
      c.env,
      c.executionCtx,
    );
    const text = await res.text();
    let body: unknown = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    return { status: res.status, body };
  };

  try {
    return c.json(await runChat({ provider, system, transcript, tools: AGENT_TOOLS, execute }));
  } catch (err) {
    console.error("chat failed", err);
    return c.json({ text: "The assistant could not reach its model provider. Try again shortly.", changeset: null, tool_calls: [] });
  }
});
