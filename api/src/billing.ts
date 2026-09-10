/**
 * Run credits — the pure part: what a credit costs, what a pack contains, and
 * the arithmetic the UI shows. No I/O lives here, so the pack catalog can be
 * read by the checkout route, the webhook and the balance endpoint without any
 * of them being able to disagree about what a SKU means.
 *
 * Pricing is B2B. A CharmQuark run is a booked lab slot — one robot, one
 * operator, one sensor rig, four effort units (about half a working day of
 * fleet time, several hundred dollars fully loaded before anyone opens this
 * app). Credits are priced as a fraction of that slot, and the discount curve
 * rewards committing a whole program rather than a single slot at a time.
 */

/** The single account every user of a deployment spends from. See 0002_billing.sql. */
export const DEFAULT_ACCOUNT_ID = "cccccccc-cccc-4ccc-8ccc-000000000001";

/** Confirming one run costs this many credits. */
export const RUN_CREDIT_COST = 1;

export interface CreditPack {
  id: string;
  name: string;
  description: string;
  credits: number;
  amount_cents: number;
  currency: string;
  /** Merchandising label shown on the pack card, if any. */
  tag?: string;
}

/**
 * Fixed-price, fixed-credit SKUs. Deliberately not per-unit quantities: "buy a
 * pack" stays one click, and the price per run falls as the commitment grows
 * ($119 -> $55), which is the whole shape of a fleet-operations deal.
 *
 * There are no pre-created Stripe Prices — checkout builds `price_data` inline
 * from these numbers, so changing a tier is a code change and nothing else.
 */
export const CREDIT_PACKS: readonly CreditPack[] = [
  {
    id: "runs-trial",
    name: "Trial — 5 runs",
    description: "5 confirmed data-collection runs. Enough to walk one mission group end to end.",
    credits: 5,
    amount_cents: 59_500, // $595 — $119/run
    currency: "usd",
  },
  {
    id: "runs-pilot",
    name: "Pilot — 25 runs",
    description: "25 confirmed runs. A short campaign on a single robot platform.",
    credits: 25,
    amount_cents: 245_000, // $2,450 — $98/run
    currency: "usd",
  },
  {
    id: "runs-program",
    name: "Program — 100 runs",
    description: "100 confirmed runs. A full perception or manipulation campaign across a fleet.",
    credits: 100,
    amount_cents: 850_000, // $8,500 — $85/run
    currency: "usd",
    tag: "Most teams",
  },
  {
    id: "runs-fleet",
    name: "Fleet — 300 runs",
    description: "300 confirmed runs. Multiple concurrent campaigns, multiple labs.",
    credits: 300,
    amount_cents: 2_100_000, // $21,000 — $70/run
    currency: "usd",
    tag: "Best value",
  },
  {
    id: "runs-enterprise",
    name: "Enterprise — 1,000 runs",
    description: "1,000 confirmed runs. Annual fleet program; usually invoiced rather than carded.",
    credits: 1000,
    amount_cents: 5_500_000, // $55,000 — $55/run
    currency: "usd",
  },
] as const;

export const packById = (id: string): CreditPack | undefined =>
  CREDIT_PACKS.find((p) => p.id === id);

/** Unit price, for the "$/run" line on a pack card. */
export const centsPerCredit = (p: CreditPack): number => Math.round(p.amount_cents / p.credits);

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
