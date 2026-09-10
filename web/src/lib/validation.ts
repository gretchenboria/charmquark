// Lightweight, framework-free field validation shared by create/edit forms.
// UX-only mirror of server-side validation; the backend remains the source of truth.

/** Rule applied to a single field value. */
export interface FieldRule {
  /** Value must be non-empty after trimming (strings) or non-null (numbers). */
  required?: boolean;
  /** Numeric lower bound (inclusive). */
  min?: number;
  /** Numeric upper bound (inclusive). */
  max?: number;
  /** Treat this field as numeric when validating. */
  numeric?: boolean;
  /** Human label used in default messages. */
  label?: string;
}

/**
 * Validate one value against a rule. Returns an error string, or null if valid.
 * Checkboxes/booleans are never invalid here.
 */
export function validateField(value: unknown, rule: FieldRule): string | null {
  const label = rule.label ?? "This field";

  if (rule.numeric) {
    // Empty numeric input: only an error when required.
    if (value === "" || value === null || value === undefined) {
      return rule.required ? `${label} is required.` : null;
    }
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return `${label} must be a number.`;
    if (rule.min !== undefined && n < rule.min) return `${label} must be at least ${rule.min}.`;
    if (rule.max !== undefined && n > rule.max) return `${label} must be at most ${rule.max}.`;
    return null;
  }

  if (rule.required) {
    const s = typeof value === "string" ? value.trim() : value;
    if (s === "" || s === null || s === undefined) return `${label} is required.`;
  }
  return null;
}

/** Trim a value if it is a string; pass through otherwise. */
export function trimValue<T>(value: T): T {
  return typeof value === "string" ? (value.trim() as unknown as T) : value;
}
