/**
 * Describe a workflow in words, get a diagram. The model answers by calling
 * emit_workflow with a JSON graph, never raw XML. The graph is checked against the
 * service catalogue, and one bounded retry feeds the problems back. The route
 * builds and lays out the BPMN from the checked graph.
 *
 * Pure apart from the provider, which tests replace.
 */
import type { AgentTool } from "./tools.ts";
import type { LlmProvider, Transcript } from "./llm.ts";
import {
  WORKFLOW_GRAPH_SCHEMA, WORKFLOW_NODE_TYPES, WORKFLOW_SERVICES, checkGraph, type WorkflowGraph,
} from "../../../packages/contracts/src/workflows.ts";

export const EMIT_WORKFLOW: AgentTool = {
  name: "emit_workflow", title: "Emit the workflow",
  description: "Return the whole workflow as a graph of nodes and flows.",
  inputSchema: WORKFLOW_GRAPH_SCHEMA,
  mutates: false, uiPath: "/workflows/designer", inApp: false,
  plan: () => ({ local: null }),
};

export const GENERATE_ATTEMPTS = 2;

export function workflowSystemPrompt(): string {
  return [
    "You design BPMN workflows for CharmQuark, a robot fleet data-collection operations app.",
    "Answer only by calling emit_workflow once with the whole workflow.",
    `Node types: ${WORKFLOW_NODE_TYPES.join(", ")}.`,
    "Rules: at least one start and one end; every node reachable from a start; every node except an end leads somewhere; " +
      "label the flows leaving a gateway; ids are short snake_case.",
    "Bind every step CharmQuark performs to a service: system services on service_task nodes, human services on user_task nodes. " +
      "Use a plain task only when no service fits.",
    "Services:",
    ...WORKFLOW_SERVICES.map((s) => `- ${s.id} (${s.kind}): ${s.label}. ${s.description}`),
  ].join("\n");
}

export async function generateGraph(
  provider: LlmProvider,
  description: string,
): Promise<{ ok: true; graph: WorkflowGraph } | { ok: false; errors: string[] }> {
  const system = workflowSystemPrompt();
  const transcript: Transcript[] = [{ kind: "user", text: description }];
  let errors = ["the model did not return a workflow"];
  for (let attempt = 0; attempt < GENERATE_ATTEMPTS; attempt++) {
    const step = await provider.step(system, transcript, [EMIT_WORKFLOW]);
    const use = step.toolUses.find((u) => u.name === EMIT_WORKFLOW.name);
    if (!use) {
      errors = ["the model did not return a workflow"];
      transcript.push(
        { kind: "assistant", text: step.text || "(no answer)", toolUses: [] },
        { kind: "user", text: "Call emit_workflow with the workflow graph." },
      );
      continue;
    }
    const checked = checkGraph(use.args);
    if (checked.ok) return checked;
    errors = checked.errors;
    transcript.push(
      { kind: "assistant", text: step.text, toolUses: [use] },
      { kind: "tool_results", results: [{ id: use.id, name: use.name, content: { problems: errors, instruction: "Fix every problem and call emit_workflow again." } }] },
    );
  }
  return { ok: false, errors };
}
