/**
 * The API's door into packages/contracts, plus the one helper that turns a
 * contract violation into an HTTP answer.
 */
import { HTTPException } from "hono/http-exception";
import { validateBody, type FieldSpec, type Mode } from "../../packages/contracts/src/index.ts";

export * from "../../packages/contracts/src/index.ts";

/**
 * 400 with every problem at once — "status must be one of …; capacity must be a
 * whole number" — rather than the 500 a SQL CHECK failure used to produce.
 */
export function assertValid(spec: { label: string; fields: Record<string, FieldSpec> }, body: Record<string, unknown>, mode: Mode): void {
  const errors = validateBody(spec.fields, body, mode);
  if (errors.length) {
    throw new HTTPException(400, {
      message: `invalid ${spec.label}: ${errors.map((e) => `${e.field} ${e.message}`).join("; ")}`,
    });
  }
}
