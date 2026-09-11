/**
 * Run credits — the pure part the API needs: the account, the pack catalog (shared
 * with the central store in packages/contracts/src/billing.ts) and the messages
 * the UI shows. No I/O lives here.
 */
import { RUN_CREDIT_COST } from "../../packages/contracts/src/billing.ts";

export {
  CREDIT_PACKS, RUN_CREDIT_COST, centsPerCredit, packById, type CreditPack,
} from "../../packages/contracts/src/billing.ts";

/** The single account every user of a deployment spends from. See 0002_billing.sql. */
export const DEFAULT_ACCOUNT_ID = "cccccccc-cccc-4ccc-8ccc-000000000001";

/**
 * Where the browser comes back to after Stripe. Only same-app relative paths are
 * accepted: a caller-supplied return path is otherwise an open redirect handed
 * straight to Stripe's `success_url`.
 */
export function safeReturnPath(raw: unknown, fallback = "/home"): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw.split("#")[0]!.split("?")[0]! || fallback;
}

/** The message a caller sees on 402. Actionable, and it names the price. */
export const outOfCreditsMessage = (balance: number): string =>
  `Out of run credits — confirming a run costs ${RUN_CREDIT_COST} credit and this account has ${balance}. ` +
  `Buy a credit pack to confirm this run; assembling and auto-scheduling stay free.`;
