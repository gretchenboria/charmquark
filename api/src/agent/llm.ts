/**
 * The in-app assistant's reasoning loop, model-neutral.
 *
 * A provider adapter (Gemini or Anthropic) turns a neutral transcript and the
 * tool registry into one model call and back. `runChat` loops: model → tool
 * calls executed as the user → results back to the model, for a bounded number
 * of steps. The assistant is only given tools marked `inApp` — it reads and it
 * proposes change sets; applying one is a button a person presses.
 *
 * Pure apart from `fetch`, which tests replace.
 */
import { ToolArgError, type AgentTool, type ToolCall } from "./tools.ts";

export type Transcript =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; toolUses: ToolUse[] }
  | { kind: "tool_results"; results: { id: string; name: string; content: unknown }[] };

export interface ToolUse { id: string; name: string; args: Record<string, unknown> }
export interface ModelStep { text: string; toolUses: ToolUse[] }

export interface LlmProvider {
  name: "gemini" | "anthropic";
  step(system: string, transcript: Transcript[], tools: AgentTool[]): Promise<ModelStep>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Gemini's function declarations accept an OpenAPI subset: drop keys it rejects. */
function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema as Record<string, unknown>)
      .filter(([k]) => k !== "additionalProperties" && k !== "$schema")
      .map(([k, v]) => [k, geminiSchema(v)]),
  );
}

export function geminiProvider(apiKey: string, model: string, fetchImpl: FetchLike = fetch): LlmProvider {
  return {
    name: "gemini",
    async step(system, transcript, tools) {
      const contents = transcript.map((t) => {
        if (t.kind === "user") return { role: "user", parts: [{ text: t.text }] };
        if (t.kind === "assistant") {
          return { role: "model", parts: [...(t.text ? [{ text: t.text }] : []), ...t.toolUses.map((u) => ({ functionCall: { name: u.name, args: u.args } }))] };
        }
        return { role: "user", parts: t.results.map((r) => ({ functionResponse: { name: r.name, response: { result: r.content } } })) };
      });
      const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.inputSchema) })) }],
        }),
      });
      if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
      const data = (await res.json()) as { candidates?: { content?: { parts?: Record<string, unknown>[] } }[] };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      return {
        text: parts.map((p) => (typeof p["text"] === "string" ? p["text"] : "")).join(""),
        toolUses: parts
          .filter((p) => p["functionCall"])
          .map((p, i) => {
            const fc = p["functionCall"] as { name: string; args?: Record<string, unknown> };
            return { id: `call_${i}`, name: fc.name, args: fc.args ?? {} };
          }),
      };
    },
  };
}

export function anthropicProvider(apiKey: string, model: string, fetchImpl: FetchLike = fetch): LlmProvider {
  return {
    name: "anthropic",
    async step(system, transcript, tools) {
      const messages = transcript.map((t) => {
        if (t.kind === "user") return { role: "user", content: t.text };
        if (t.kind === "assistant") {
          return {
            role: "assistant",
            content: [
              ...(t.text ? [{ type: "text", text: t.text }] : []),
              ...t.toolUses.map((u) => ({ type: "tool_use", id: u.id, name: u.name, input: u.args })),
            ],
          };
        }
        return { role: "user", content: t.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: JSON.stringify(r.content) })) };
      });
      const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system,
          tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
          messages,
        }),
      });
      if (!res.ok) throw new Error(`Anthropic returned ${res.status}`);
      const data = (await res.json()) as { content?: Record<string, unknown>[] };
      const blocks = data.content ?? [];
      return {
        text: blocks.filter((b) => b["type"] === "text").map((b) => String(b["text"])).join(""),
        toolUses: blocks
          .filter((b) => b["type"] === "tool_use")
          .map((b) => ({ id: String(b["id"]), name: String(b["name"]), args: (b["input"] ?? {}) as Record<string, unknown> })),
      };
    },
  };
}

export interface ChatOutcome {
  text: string;
  /** The last change set the assistant proposed, for the person to review and apply. */
  changeset: unknown | null;
  tool_calls: { name: string; ok: boolean }[];
}

export const MAX_STEPS = 6;

export async function runChat(opts: {
  provider: LlmProvider;
  system: string;
  transcript: Transcript[];
  tools: AgentTool[];
  execute: (call: ToolCall) => Promise<{ status: number; body: unknown }>;
}): Promise<ChatOutcome> {
  const tools = opts.tools.filter((t) => t.inApp);
  const transcript = [...opts.transcript];
  const toolCalls: ChatOutcome["tool_calls"] = [];
  let changeset: unknown = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const out = await opts.provider.step(opts.system, transcript, tools);
    if (out.toolUses.length === 0) return { text: out.text, changeset, tool_calls: toolCalls };

    transcript.push({ kind: "assistant", text: out.text, toolUses: out.toolUses });
    const results: { id: string; name: string; content: unknown }[] = [];
    for (const use of out.toolUses) {
      const tool = tools.find((t) => t.name === use.name);
      let content: unknown;
      let ok = false;
      if (!tool) {
        content = { error: `tool ${use.name} is not available to the assistant` };
      } else {
        try {
          const planned = tool.plan(use.args);
          if ("local" in planned) {
            content = planned.local;
            ok = true;
          } else {
            const { status, body } = await opts.execute(planned);
            ok = status < 400;
            content = ok ? body : { error: `HTTP ${status}`, detail: body };
            if (ok && tool.name === "propose_changes") changeset = body;
          }
        } catch (err) {
          content = { error: err instanceof ToolArgError ? err.message : "tool failed" };
        }
      }
      toolCalls.push({ name: use.name, ok });
      results.push({ id: use.id, name: use.name, content });
    }
    transcript.push({ kind: "tool_results", results });
  }
  return {
    text: "I stopped after several steps without finishing. Try a narrower request.",
    changeset,
    tool_calls: toolCalls,
  };
}
