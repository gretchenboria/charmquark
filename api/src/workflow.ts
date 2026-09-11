/**
 * Is this a BPMN diagram CharmQuark can use? Parses with bpmn-moddle plus the
 * cq: extension, then checks the elements against the supported set and every
 * cq:service binding against the service catalogue
 * (packages/contracts/src/workflows.ts).
 *
 * Errors mean the diagram is wrong; warnings are what a half-drawn diagram
 * normally has. A save refuses only SAVE_BLOCKING errors, so people can save work
 * in progress; `POST /workflows/validate` reports everything.
 *
 * Pure (no Worker APIs), so it is unit-tested directly.
 */
import { BpmnModdle } from "bpmn-moddle";
import {
  CQ_MODDLE, SUPPORTED_BPMN_TYPES, reachable, serviceById, type BpmnBinding, type BpmnProblem, type BpmnReport,
} from "../../packages/contracts/src/workflows.ts";

/** Errors a save refuses outright: the XML is not BPMN, or it names a service that does not exist. */
export const SAVE_BLOCKING: ReadonlySet<string> = new Set(["not_bpmn", "unknown_service"]);
export const MAX_BPMN_CHARS = 1_000_000;

interface El {
  $type: string;
  id?: string;
  name?: string;
  $attrs?: Record<string, string>;
  get: (key: string) => unknown;
  rootElements?: El[];
  flowElements?: El[];
  sourceRef?: El;
  targetRef?: El;
}

const label = (el: El) => (el.name ? `"${el.name}"` : el.id ?? "an element");
const kindName = (type: string) => type.replace(/^bpmn:/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

export async function validateBpmn(xml: unknown): Promise<BpmnReport> {
  const errors: BpmnProblem[] = [];
  const warnings: BpmnProblem[] = [];
  const bindings: BpmnBinding[] = [];
  const report = (): BpmnReport => ({ ok: errors.length === 0, errors, warnings, bindings });

  if (typeof xml !== "string" || !xml.trim()) {
    errors.push({ code: "not_bpmn", message: "the diagram is empty" });
    return report();
  }
  if (xml.length > MAX_BPMN_CHARS) {
    errors.push({ code: "not_bpmn", message: `the diagram is larger than ${MAX_BPMN_CHARS} characters` });
    return report();
  }

  let root: El;
  try {
    const parsed = await new BpmnModdle({ cq: CQ_MODDLE }).fromXML(xml);
    root = parsed.rootElement as unknown as El;
    for (const w of parsed.warnings as { message: string }[]) {
      // Stray cq: attributes are reported below, with their element.
      if (!/unknown attribute <cq:/.test(w.message)) warnings.push({ code: "xml", message: w.message.split("\n")[0]! });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : "unreadable";
    errors.push({ code: "not_bpmn", message: `not a BPMN 2.0 diagram: ${msg}` });
    return report();
  }

  const processes = (root.rootElements ?? []).filter((e) => e.$type === "bpmn:Process");
  if (!processes.length) errors.push({ code: "no_process", message: "the diagram has no process" });

  for (const proc of processes) {
    const elements = proc.flowElements ?? [];
    const nodes = elements.filter((e) => e.$type !== "bpmn:SequenceFlow");
    const flows = elements.filter((e) => e.$type === "bpmn:SequenceFlow");
    const where = processes.length > 1 ? ` in ${proc.name ?? proc.id}` : "";

    for (const el of elements) {
      const id = el.id;
      if (!SUPPORTED_BPMN_TYPES.includes(el.$type)) {
        errors.push({ code: "unsupported_element", element_id: id, message: `${label(el)} is a ${kindName(el.$type)}, which CharmQuark workflows do not support` });
      }
      for (const key of Object.keys(el.$attrs ?? {})) {
        if (key === "cq:service") {
          errors.push({ code: "misplaced_binding", element_id: id, message: `${label(el)} has a service, but only service and user tasks can` });
        } else if (key.startsWith("cq:")) {
          warnings.push({ code: "unknown_extension", element_id: id, message: `${label(el)} has an unknown attribute ${key}` });
        }
      }
      if (el.$type !== "bpmn:ServiceTask" && el.$type !== "bpmn:UserTask") continue;
      const service = el.get("cq:service");
      if (typeof service !== "string" || !service) {
        if (el.$type === "bpmn:ServiceTask") warnings.push({ code: "unbound_task", element_id: id, message: `${label(el)} is not bound to a service yet` });
        continue;
      }
      const svc = serviceById(service);
      if (!svc) {
        errors.push({ code: "unknown_service", element_id: id, message: `${label(el)} is bound to "${service}", which is not a CharmQuark service` });
        continue;
      }
      bindings.push({ element_id: id ?? "", name: el.name ?? null, service });
      const expected = svc.kind === "human" ? "bpmn:UserTask" : "bpmn:ServiceTask";
      if (el.$type !== expected) {
        warnings.push({
          code: "task_kind_mismatch", element_id: id,
          message: `${svc.label} is a ${svc.kind} step, so make ${label(el)} a ${svc.kind === "human" ? "user" : "service"} task`,
        });
      }
    }

    for (const f of flows) {
      if (!f.sourceRef || !f.targetRef) errors.push({ code: "broken_flow", element_id: f.id, message: `flow ${f.id ?? ""} is missing its source or target` });
    }
    const edges = flows.filter((f) => f.sourceRef?.id && f.targetRef?.id).map((f) => ({ from: f.sourceRef!.id!, to: f.targetRef!.id! }));
    const starts = nodes.filter((n) => n.$type === "bpmn:StartEvent");
    if (!starts.length) {
      if (nodes.length) errors.push({ code: "no_start", message: `add a start event${where}` });
    } else {
      const seen = reachable(starts.map((s) => s.id ?? ""), edges);
      for (const n of nodes) {
        if (n.id && !seen.has(n.id)) errors.push({ code: "unreachable", element_id: n.id, message: `${label(n)} cannot be reached from a start event` });
      }
    }
    if (nodes.length && !nodes.some((n) => n.$type === "bpmn:EndEvent")) warnings.push({ code: "no_end", message: `add an end event${where}` });
    for (const n of nodes) {
      if (n.$type !== "bpmn:EndEvent" && n.id && !edges.some((e) => e.from === n.id)) {
        warnings.push({ code: "dead_end", element_id: n.id, message: `${label(n)} leads nowhere` });
      }
    }
  }
  return report();
}
