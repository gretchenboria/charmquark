export const RUN_CREDIT_COST = 1;

export interface CreditPack {
  id: string;
  name: string;
  description: string;
  credits: number;
  amount_cents: number;
  currency: string;
  tag?: string;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  {
    id: "enterprise-license",
    name: "Enterprise Perpetual License",
    description: "Permanently unlocks the C2 Dashboard for an unlimited number of physical execution runs across your entire ROS2 fleet.",
    credits: 1_000_000,
    amount_cents: 850_000, // $8,500
    currency: "usd",
    tag: "Unlimited",
  },
];

export const packById = (id: string): CreditPack | undefined => CREDIT_PACKS.find((p) => p.id === id);

export const centsPerCredit = (p: CreditPack): number => Math.round(p.amount_cents / p.credits);
