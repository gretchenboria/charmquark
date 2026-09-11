/**
 * The deployment's model provider, shared by Charmy and workflow generation:
 * chosen by the agents.llm_provider setting, key from the Integrations page or a
 * Worker secret.
 */
import type { Env } from "./types";
import { anthropicProvider, geminiProvider, type LlmProvider } from "./agent/llm";
import { integrationKey } from "./routes/integrations";
import { loadSettings } from "./settings";

/** The provider, or a sentence explaining why there is none. */
export async function providerFor(env: Env): Promise<LlmProvider | string> {
  const name = (await loadSettings(env.DB))["agents.llm_provider"];
  if (name === "anthropic") {
    const key = (await integrationKey(env, "anthropic").catch(() => null)) ?? env.ANTHROPIC_API_KEY;
    if (!key) return "No Anthropic API key: add one on the Integrations page or set ANTHROPIC_API_KEY.";
    return anthropicProvider(key, env.ANTHROPIC_MODEL || "claude-sonnet-5");
  }
  const key = (await integrationKey(env, "gemini").catch(() => null)) ?? env.GEMINI_API_KEY;
  if (!key) return "No Gemini API key: add one on the Integrations page or set GEMINI_API_KEY.";
  return geminiProvider(key, env.GEMINI_MODEL || "gemini-3.8-flash");
}
