// bpmn-moddle ships no types for its ESM entry; this is the part workflow.ts uses.
declare module "bpmn-moddle" {
  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>);
    fromXML(xml: string): Promise<{ rootElement: unknown; warnings: { message: string }[] }>;
  }
}
