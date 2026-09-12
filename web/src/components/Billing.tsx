"use client";

/**
 * Run credits in the browser: the sidebar meter, the purchase modal, and the
 * return-from-Stripe claim.
 *
 * One credit buys one confirmed run, so the balance is a planning number an
 * operator wants in the corner of their eye — hence a permanent rail meter
 * rather than a billing page nobody visits. The provider is app-wide because
 * the 402 that opens the modal can come from any metered call; it listens for
 * the event the API client raises instead of every call site knowing about
 * billing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { ApiError, OUT_OF_CREDITS_EVENT, api } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import type { BillingAccount, CreditPack } from "@/lib/types";
import { useToast } from "./Toast";

interface BillingCtx {
  account: BillingAccount | null;
  /** Re-read the balance — call it after anything that spends or grants credits. */
  refresh: () => Promise<void>;
  /** Open the purchase modal, optionally with the reason it was opened. */
  openPaywall: (reason?: string) => void;
}

const Ctx = createContext<BillingCtx>({
  account: null,
  refresh: async () => {},
  openPaywall: () => {},
});

export const useBilling = (): BillingCtx => useContext(Ctx);

const usd = (cents: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

/** How long to keep asking whether the webhook has landed after a purchase. */
const CLAIM_ATTEMPTS = 8;
const CLAIM_INTERVAL_MS = 1500;

export function BillingProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const toast = useToast();
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setAccount(await api.getBillingAccount());
    } catch {
      // A balance the sidebar cannot read is not worth a toast; the meter hides.
    }
  }, []);

  const openPaywall = useCallback((why?: string) => {
    setReason(why ?? null);
    setOpen(true);
  }, []);

  // Only signed-in sessions carry the headers the API expects.
  useEffect(() => {
    if (!user) {
      setAccount(null);
      return;
    }
    void refresh();
  }, [user, refresh]);

  // Any 402, from anywhere, opens the modal carrying the server's own message.
  useEffect(() => {
    const onBlocked = (e: Event) => {
      openPaywall(typeof (e as CustomEvent).detail === "string" ? (e as CustomEvent).detail : undefined);
      void refresh();
    };
    window.addEventListener(OUT_OF_CREDITS_EVENT, onBlocked);
    return () => window.removeEventListener(OUT_OF_CREDITS_EVENT, onBlocked);
  }, [openPaywall, refresh]);

  // Back from Stripe: poll until the webhook has credited the account, then
  // scrub the query string so a reload does not re-run the claim.
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const payment = params.get("payment");
    if (!payment) return;

    let alive = true;
    const clean = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, document.title, url.toString());
    };

    if (payment !== "success" || !sessionId) {
      toast("info", "Checkout cancelled — no credits were purchased.");
      clean();
      return;
    }

    (async () => {
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS && alive; attempt += 1) {
        try {
          const claim = await api.claimCheckout(sessionId);
          if (claim.status === "COMPLETED") {
            if (!alive) return;
            toast("success", `${claim.credits} run credits added — balance ${claim.balance}.`);
            await refresh();
            clean();
            return;
          }
        } catch {
          // Transient: keep polling rather than giving up on a paid purchase.
        }
        await new Promise((r) => setTimeout(r, CLAIM_INTERVAL_MS));
      }
      if (!alive) return;
      // Payment succeeded; only our side is late. Say so honestly.
      toast("info", "Payment received — credits are still being applied. They will appear shortly.");
      await refresh();
      clean();
    })();

    return () => {
      alive = false;
    };
  }, [user, refresh, toast]);

  return (
    <Ctx.Provider value={{ account, refresh, openPaywall }}>
      {children}
      {open && (
        <PurchaseModal
          account={account}
          reason={reason}
          onClose={() => setOpen(false)}
          onRefresh={refresh}
        />
      )}
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------- the rail meter
/**
 * The balance, in the navigation rail beside connectivity. Reads as a quiet
 * status line until it runs low, when it picks up the warm accents — apricot
 * for "think about it", rose for "the next confirm will fail".
 */

// ---------------------------------------------------------------- the modal
function PurchaseModal({
  account,
  reason,
  onClose,
  onRefresh,
}: {
  account: BillingAccount | null;
  reason: string | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(reason);

  useEffect(() => {
    void onRefresh();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onRefresh]);

  // Returning from the store tab: pick up credits the store has delivered.
  useEffect(() => {
    if (!account?.store_url) return;
    const onFocus = () => void onRefresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [account?.store_url, onRefresh]);

  const buy = async (pack: CreditPack) => {
    if (account?.store_url) {
      window.open(`${account.store_url}&pack=${encodeURIComponent(pack.id)}`, "_blank", "noopener");
      setMessage("Finish the purchase in the CharmQuark store tab. Credits appear here within a minute of payment.");
      return;
    }
    setBusy(pack.id);
    setMessage("Opening secure checkout…");
    try {
      const { url } = await api.startCheckout(pack.id, window.location.pathname);
      window.location.href = url;
    } catch (e) {
      setBusy(null);
      setMessage(e instanceof ApiError ? e.friendly : "Could not start checkout.");
    }
  };

  const packs = account?.packs ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(30, 24, 48, 0.55)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="cq-card max-h-[88vh] w-full max-w-4xl overflow-y-auto p-6 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to Enterprise"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="cq-display text-xl font-semibold">Upgrade to Enterprise</h2>
            <p className="mt-1 max-w-xl text-sm text-[color:var(--cq-ink-soft)]">
              Unlock unlimited fleet execution, permanent access to the C2 Dashboard, and priority support for your entire ROS2 robotics fleet.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[color:var(--cq-ink-faint)] hover:bg-[color:var(--cq-ground)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex items-baseline gap-2 border-y border-[color:var(--cq-line)] py-3">
          <span className="cq-display cq-gradient-text text-3xl font-semibold">
            {account?.unlimited ? "∞" : (account?.balance ?? "—")}
          </span>
          <span className="text-sm text-[color:var(--cq-ink-soft)]">
            demo runs remaining on {account?.name ?? "this account"}
          </span>
          {account && !account.unlimited && (
            <span className="ml-auto text-xs text-[color:var(--cq-ink-faint)]">
              Upgrade to permanently unlock execution
            </span>
          )}
        </div>

        {account && account.store_url && (
          <div className="mt-4 rounded-xl border border-[color:var(--cq-line)] bg-[color:var(--cq-ground)] p-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-[color:var(--cq-ink)]">CharmQuark Store</h3>
              <p className="text-sm text-[color:var(--cq-ink-soft)] mt-1">
                This deployment&apos;s credits are centrally managed. Purchases are processed through the CharmQuark Store.
              </p>
            </div>
            <a 
              href={account.store_url} 
              target="_blank" 
              rel="noopener" 
              className="cq-btn-primary shrink-0 rounded-lg px-4 py-2 text-sm font-medium"
            >
              Open Store
            </a>
          </div>
        )}

        {account && !account.payments_configured && !account.store_url && (
          <p className="mt-4 rounded-xl border border-[color:var(--cq-line)] bg-[color:var(--cq-ground)] p-3 text-sm text-[color:var(--cq-ink-soft)]">
            Payments are not configured on this deployment yet. Credits can still be granted
            directly on the account — see <span className="font-medium">docs/BILLING.md</span>.
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((p) => (
            <button
              key={p.id}
              onClick={() => buy(p)}
              disabled={busy !== null}
              className="relative flex flex-col items-start rounded-2xl border border-[color:var(--cq-line)] bg-white p-4 text-left transition-shadow hover:shadow-[var(--cq-shadow-lift)] disabled:cursor-wait disabled:opacity-60"
            >
              {p.tag && (
                <span
                  className="absolute -top-2 right-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
                  style={{ background: "var(--cq-gradient)" }}
                >
                  {p.tag}
                </span>
              )}
              <div className="cq-display text-2xl font-semibold">{p.name}</div>
              
              <div className="mt-3 text-lg font-medium text-[color:var(--cq-ink)]">
                {usd(p.amount_cents)}
              </div>
              <div className="text-xs text-[color:var(--cq-ink-soft)]">
                Lifetime Access
              </div>
              <div className="mt-2 mb-4 text-xs leading-snug text-[color:var(--cq-ink-faint)] flex-1">
                {p.description}
              </div>
              <div className="mt-auto w-full text-center rounded-lg border border-[color:var(--cq-line)] bg-[color:var(--cq-ground)] py-1.5 text-xs font-medium text-[color:var(--cq-ink-soft)]">
                {account?.store_url ? "Buy in Store ↗" : "Buy locally"}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-auto pt-5 flex items-center justify-between gap-4">
          <p className="min-h-[1.25rem] text-sm text-[color:var(--cq-ink-soft)]">{message ?? ""}</p>
          <button
            onClick={onClose}
            className="cq-btn-primary shrink-0 rounded-xl px-4 py-2 text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
export function CreditMeter() {
  const { account, openPaywall } = useBilling();
  if (!account) return null;

  const { balance, unlimited } = account;
  
  if (unlimited) {
    return (
      <div className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-white/45 bg-white/5 border border-white/10">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#4E9E71]" style={{ boxShadow: `0 0 7px 1px #4E9E7199` }} aria-hidden />
        <span className="truncate">
          <span className="font-semibold text-white/80">Enterprise</span> License Active
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={() => openPaywall()}
      title={`${balance} demo runs remaining. Click to upgrade to Enterprise.`}
      className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-white/45 transition-colors bg-[#D4536B]/10 border border-[#D4536B]/30 hover:bg-[#D4536B]/20 hover:text-white/80"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-[#D4536B]" style={{ boxShadow: `0 0 7px 1px #D4536B99` }} aria-hidden />
      <span className="truncate">
        <span className="font-semibold text-white/80">{balance}</span> demo runs
      </span>
      <span className="ml-auto shrink-0 text-white/80 font-medium">Upgrade</span>
    </button>
  );
}
