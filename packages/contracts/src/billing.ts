/**
 * Run credits: what a credit costs and what a pack contains. Shared by the
 * customer API (balance, 402 messages, legacy checkout) and the central store
 * (checkout, grants), so the two can never disagree about what a SKU means.
 *
 * Pricing is B2B. A CharmQuark run is a booked lab slot: one robot, one
 * operator, one sensor rig, four effort units (about half a working day of fleet
 * time, several hundred dollars fully loaded before anyone opens this app).
 * Credits are priced as a fraction of that slot, and the discount curve rewards
 * committing a whole program rather than a single slot at a time.
 */

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
 * There are no pre-created Stripe Prices. Checkout builds `price_data` inline
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
];

export const packById = (id: string): CreditPack | undefined => CREDIT_PACKS.find((p) => p.id === id);

/** Unit price, for the "$/run" line on a pack card. */
export const centsPerCredit = (p: CreditPack): number => Math.round(p.amount_cents / p.credits);
