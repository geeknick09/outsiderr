"use client";

import { useState } from "react";
import { Crown, Lock, Sparkles } from "lucide-react";

import { formatPaise } from "@/modules/shared";
import { Button } from "@/modules/shared";
import { RazorpayCheckout } from "@/modules/shared";
import type { CheckoutSession } from "@/modules/shared";
import {
  startPremiumCheckoutAction,
  verifyPremiumPaymentAction,
  handlePremiumFailureAction,
} from "../actions/premium";

/**
 * Premium badge - small chip marking a gated analytics feature.
 */
export function PremiumBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400"
      title="Premium analytics - free while the gate is off"
    >
      <Crown className="h-3 w-3" />
      Premium
    </span>
  );
}

interface PremiumGateProps {
  /** Admin toggle - when false every organizer sees the content for free. */
  gateEnabled: boolean;
  /** Organizer's premium_until ISO string, or null. */
  premiumUntil: string | null;
  plans: { months: number; pricePaise: number }[];
  children: React.ReactNode;
}

/**
 * Wraps a premium analytics block. Gate off or active premium → children
 * render normally with a Premium badge. Gate on + no premium → locked card
 * with an upgrade CTA that opens Razorpay.
 */
export function PremiumGate({ gateEnabled, premiumUntil, plans, children }: PremiumGateProps) {
  const isPremium = premiumUntil ? new Date(premiumUntil).getTime() > Date.now() : false;

  if (!gateEnabled || isPremium) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <PremiumBadge />
          {isPremium ? (
            <span className="text-xs text-muted">
              Active until {new Date(premiumUntil!).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-xs text-muted">Free while the gate is off</span>
          )}
        </div>
        {children}
      </div>
    );
  }

  return <PremiumUpgradeCard plans={plans} />;
}

export function PremiumUpgradeCard({ plans }: { plans: { months: number; pricePaise: number }[] }) {
  const [months, setMonths] = useState(plans[0]?.months ?? 3);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = plans.find((p) => p.months === months);

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    const result = await startPremiumCheckoutAction({ months });
    setLoading(false);
    if (result.error || !result.session) {
      setError(result.error ?? "Could not start checkout.");
      return;
    }
    setSession(result.session);
  }

  if (session) {
    return (
      <RazorpayCheckout
        session={session}
        verifyAction={verifyPremiumPaymentAction}
        failureAction={handlePremiumFailureAction}
        successRedirect="/organizer/analytics"
        onCancel={() => setSession(null)}
        onError={(msg) => {
          setError(msg);
          setSession(null);
        }}
      />
    );
  }

  return (
    <div className="glass relative overflow-hidden rounded-3xl p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-amber-400/10 p-2.5">
          <Lock className="h-5 w-5 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold">Audience Insights</h3>
            <PremiumBadge />
          </div>
          <p className="mt-1 text-sm text-muted">
            Unlock who your attendees are - returning vs new, age groups, gender,
            cities, and what categories they book. Upgrade to Premium to see this.
          </p>
        </div>
      </div>

      {plans.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {plans.map((p) => (
            <button
              key={p.months}
              type="button"
              onClick={() => setMonths(p.months)}
              className={`rounded-2xl border p-3 text-left transition-colors ${
                months === p.months
                  ? "border-violet-neon bg-violet-neon/10"
                  : "border-zinc-200 hover:border-violet-neon/50 dark:border-white/10"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {p.months} months
              </p>
              <p className="mt-0.5 text-lg font-black">{formatPaise(p.pricePaise)}</p>
              <p className="text-xs text-muted">
                {formatPaise(Math.round(p.pricePaise / p.months))}/mo
              </p>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <Button
          size="sm"
          onClick={handleUpgrade}
          disabled={loading || !selected}
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "Starting checkout…" : `Upgrade - ${selected ? formatPaise(selected.pricePaise) : ""}`}
        </Button>
        <p className="text-xs text-muted">Renews manually - no auto-debit.</p>
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-red-500">{error}</p> : null}
    </div>
  );
}
