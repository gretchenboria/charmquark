/**
 * Field specifications and the validator that enforces them.
 *
 * A resource's fields say what each one is, whether it can be written, and — when
 * it cannot — why. That last part is what lets the UI show a locked field with a
 * reason instead of a mystery, and lets an agent learn the rules instead of
 * guessing and hitting a 403.
 */
import type { Role } from "./enums.ts";

export type FieldType =
  | "string"    // short text
  | "text"      // long text
  | "integer"
  | "number"
  | "boolean"
  | "enum"      // one of `values`
  | "date"      // YYYY-MM-DD
  | "time"      // HH:MM
  | "id"        // a reference to another record
  | "id[]"      // a list of references
  | "json";     // structured value object, validated by its own route

export interface FieldSpec {
  type: FieldType;
  label: string;
  /** Allowed values (`enum`). */
  values?: readonly string[];
  /** Offered values for free text; not enforced. */
  suggestions?: readonly string[];
  nullable?: boolean;
  /** Must be present on create. */
  required?: boolean;
  min?: number;
  /**
   * Why this field cannot be written through create/update. Absent means
   * writable. Derived and server-minted fields say where their value comes from.
   */
  readonly?: string;
  /** Writable on create even though `readonly` blocks update (e.g. a parent id). */
  createOnly?: boolean;
  /** The database default, where a rule depends on whether a create departs from it. */
  default?: string | number | boolean | null;
  /** Only these roles may change the value; others must use the named action. */
  writeRoles?: readonly Role[];
  /** Why `writeRoles` exists, for the UI and agents. */
  writeRolesReason?: string;
}

export type Mode = "create" | "update";

/** Fields accepted in a body for this mode, in declaration order. */
export function writableFields(fields: Record<string, FieldSpec>, mode: Mode): string[] {
  return Object.entries(fields)
    .filter(([, f]) => !f.readonly || (mode === "create" && f.createOnly))
    .map(([name]) => name);
}

export interface FieldError {
  field: string;
  message: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** Numbers arrive as numbers from code and as numeric strings from HTML form inputs. */
const asNumber = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;

function checkValue(name: string, f: FieldSpec, v: unknown): string | null {
  if (v === null) return f.nullable ? null : "may not be null";
  // A cleared form field sends "", which means "no value" for an optional field.
  if (v === "" && f.nullable) return null;
  switch (f.type) {
    case "string":
    case "text":
    case "id":
      return typeof v === "string" ? null : "must be a string";
    case "integer": {
      const n = asNumber(v);
      if (n === null || !Number.isInteger(n)) return "must be a whole number";
      return f.min !== undefined && n < f.min ? `must be at least ${f.min}` : null;
    }
    case "number": {
      const n = asNumber(v);
      if (n === null || !Number.isFinite(n)) return "must be a number";
      return f.min !== undefined && n < f.min ? `must be at least ${f.min}` : null;
    }
    case "boolean":
      return typeof v === "boolean" || v === 0 || v === 1 ? null : "must be true or false";
    case "enum":
      return typeof v === "string" && (f.values ?? []).includes(v)
        ? null
        : `must be one of ${(f.values ?? []).join(", ")}`;
    case "date":
      return typeof v === "string" && DATE.test(v) ? null : "must be a date (YYYY-MM-DD)";
    case "time":
      return typeof v === "string" && TIME.test(v) ? null : "must be a time (HH:MM)";
    case "id[]":
      return Array.isArray(v) && v.every((x) => typeof x === "string") ? null : "must be a list of ids";
    case "json":
      return null;
  }
  return `unknown field type for ${name}`;
}

/**
 * Validate a create or update body. Only writable fields present in the body are
 * type-checked; unknown and read-only keys are left for the caller to ignore, so
 * a client echoing back a whole record keeps working.
 */
export function validateBody(
  fields: Record<string, FieldSpec>,
  body: Record<string, unknown>,
  mode: Mode,
): FieldError[] {
  const errors: FieldError[] = [];
  const writable = new Set(writableFields(fields, mode));
  for (const [name, f] of Object.entries(fields)) {
    const present = name in body && body[name] !== undefined;
    if (mode === "create" && f.required && (!present || body[name] === null || body[name] === "")) {
      errors.push({ field: name, message: "is required" });
      continue;
    }
    if (!present || !writable.has(name)) continue;
    const problem = checkValue(name, f, body[name]);
    if (problem) errors.push({ field: name, message: problem });
  }
  return errors;
}
