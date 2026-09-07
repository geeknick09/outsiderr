"use client";

import { useState, useTransition } from "react";
import { Rocket, CheckCircle2, Clock, XCircle } from "lucide-react";

import {
  createHeroBoostCheckoutAction,
  verifyHeroBoostPaymentAction,
  handleHeroBoostFailureAction,
} from "@/actions/hero-boosts";
import { Button } from "@/components/ui/button";
import { RazorpayCheckout } from "@/components/checkout/razorpay-checkout";
import { formatDateTime } from "@/lib/format";
import type { CheckoutSession, HeroBoost } from "@/lib/types";

export function HeroBoostPanel({
  eventId,
  boost,
  pricePaise,
  durationDays,
  eventStartsAt,
}: {
  eventId: string;
  boost: HeroBoost | null;
  pricePaise: number;
  durationDays: number;
  eventStartsAt: string;
  // Legacy prop — kept for backward compatibility but unused in Razorpay flow
  platformUpiId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [session, setSession] = useState<CheckoutSession | null>(null);

  const eventStarted = new Date(eventStartsAt).getTime() <= Date.now();
  const priceRupees = Math.round(pricePaise / 100);

  function handlePurchase() {
    setError(null);
    startTransition(async () => {
      const result = await createHeroBoostCheckoutAction(eventId);
      if (result?.error) {
        setError(result.error);
      } else if (result?.session) {
        setSession(result.session);
      }
    });
  }

  // Razorpay Checkout is open — show the checkout component
  // Pass Hero Boost-specific verify/failure actions and success redirect
  if (session) {
    return (
      <RazorpayCheckout
        session={session}
        verifyAction={verifyHeroBoostPaymentAction}
        failureAction={handleHeroBoostFailureAction}
        successRedirect="/organizer?boost=success"
        onError={(msg) => {
          setError(msg);
          setSession(null);
        }}
        onCancel={() => setSession(null)}
      />
    );
  }

  // Active boost — show status
  if (boost && boost.status === "ACTIVE") {
    return (
      <section className="glass space-y-4 rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-violet-neon" />
          <h2 className="text-lg font-bold">Front Row — Active</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusRow label="Status" value="Active" icon={<CheckCircle2 className="h-4 w-4 text-lime-neon" />} />
          <StatusRow label="Amount paid" value={`₹${priceRupees}`} />
          <StatusRow label="Started" value={boost.startedAt ? formatDateTime(boost.startedAt) : "—"} />
          <StatusRow label="Expires" value={boost.expiresAt ? formatDateTime(boost.expiresAt) : "—"} />
        </div>
        <p className="text-xs text-muted">
          Your event is featured in the Front Row carousel and rotates with other featured events.
        </p>
      </section>
    );
  }

  // Pending boost — awaiting Razorpay payment (or legacy UTR)
  if (boost && boost.status === "PENDING") {
    return (
      <section className="glass space-y-4 rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-bold">Front Row — Payment Pending</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusRow label="Amount" value={`₹${priceRupees}`} />
          <StatusRow label="Status" value="Awaiting payment" />
        </div>
        {boost.razorpayOrderId ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              Complete your payment
            </p>
            <p className="mt-1 text-xs text-muted">
              Click below to retry the payment via Razorpay. Your boost will be activated
              instantly on successful payment.
            </p>
            <Button
              onClick={handlePurchase}
              size="sm"
              className="mt-3"
              loading={pending}
              loadingText="Opening payment…"
            >
              Pay ₹{priceRupees}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Your boost order is being processed. If you cancelled the payment, you can try again below.
          </p>
        )}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
      </section>
    );
  }

  // Cancelled/expired/refunded/failed boost
  if (boost && (boost.status === "CANCELLED" || boost.status === "EXPIRED" || boost.status === "REFUNDED" || boost.status === "FAILED")) {
    return (
      <section className="glass space-y-3 rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-bold">Front Row — {boost.status.charAt(0) + boost.status.slice(1).toLowerCase()}</h2>
        </div>
        <p className="text-sm text-muted">
          This Front Row slot is no longer active. You can purchase a new one below if the event hasn&apos;t started.
        </p>
      </section>
    );
  }

  // No boost — show purchase option
  if (eventStarted) {
    return (
      <section className="glass space-y-2 rounded-3xl p-5 opacity-60">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-muted" />
          <h2 className="text-lg font-bold">Front Row</h2>
        </div>
        <p className="text-sm text-muted">
          Front Row is not available for events that have already started.
        </p>
      </section>
    );
  }

  return (
    <section className="glass space-y-4 rounded-3xl p-5">
      <div className="flex items-center gap-2">
        <Rocket className="h-5 w-5 text-violet-neon" />
        <h2 className="text-lg font-bold">Feature on Outsiderr</h2>
      </div>
      <p className="text-sm text-muted">
        Get your event featured in the Front Row carousel on the homepage. Your event will rotate with other featured events for maximum visibility.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
          <p className="text-xs text-muted">Duration</p>
          <p className="text-sm font-bold">{durationDays} days or until event starts</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
          <p className="text-xs text-muted">Price</p>
          <p className="text-sm font-bold">₹{priceRupees}</p>
        </div>
      </div>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <Button onClick={handlePurchase} size="sm" loading={pending} loadingText="Opening payment…">
        <Rocket className="h-4 w-4" />
        Feature My Event — ₹{priceRupees}
      </Button>
      <p className="text-xs text-muted">
        Secure payment via Razorpay. Your boost is activated instantly on successful payment.
      </p>
    </section>
  );
}

function StatusRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-200 px-3 py-2 dark:border-white/10">
      <span className="text-xs text-muted">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {value}
      </span>
    </div>
  );
}
