"use client";

import { useState, useTransition } from "react";
import { Lock } from "lucide-react";

import {
  createCheckoutAction,
  handlePaymentFailureAction,
  verifyPaymentAction,
} from "@/modules/web/actions/orders";
import { Button, PhoneInput, RazorpayCheckout } from "@/modules/shared";
import type { CheckoutSession } from "@/modules/shared";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

/**
 * Paid checkout — collects buyer details, then reserves inventory + opens
 * Razorpay Checkout (UPI/card/netbanking). Manual-UPI/UTR flows were removed
 * in the Razorpay migration.
 */
export function RazorpayCheckoutForm({
  eventId,
  tierId,
  quantity,
  defaultName,
  defaultPhone,
  defaultEmail,
  defaultGender,
  totalRupees,
}: {
  eventId: string;
  tierId: string;
  quantity: number;
  defaultName: string;
  defaultPhone: string;
  defaultEmail: string;
  defaultGender: string;
  totalRupees: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [pending, startTransition] = useTransition();

  function handlePay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createCheckoutAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.session) setSession(result.session);
    });
  }

  // Payment window opened — RazorpayCheckout auto-opens the modal.
  if (session) {
    return (
      <RazorpayCheckout
        session={session}
        verifyAction={verifyPaymentAction}
        failureAction={handlePaymentFailureAction}
        successRedirect={`/checkout/status?order=${session.orderId}`}
        onError={(msg) => {
          setSession(null);
          setError(msg);
        }}
        onCancel={() => setSession(null)}
      />
    );
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="tierId" value={tierId} />
      <input type="hidden" name="quantity" value={quantity} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Full name
          </span>
          <input name="buyerName" defaultValue={defaultName} required className={INPUT} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Phone
          </span>
          <PhoneInput name="buyerPhone" defaultValue={defaultPhone} required />
          <span className="block text-xs text-amber-600 dark:text-amber-400">
            Used for event updates and ticket delivery.
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Email <span className="normal-case text-zinc-400">(read-only)</span>
          </span>
          <input
            name="buyerEmail"
            type="email"
            defaultValue={defaultEmail}
            required
            readOnly
            className={`${INPUT} cursor-not-allowed opacity-60`}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Gender <span className="normal-case text-zinc-400">(optional)</span>
          </span>
          <select name="buyerGender" defaultValue={defaultGender} className={INPUT}>
            <option value="" className="bg-white dark:bg-zinc-900">Prefer not to say</option>
            <option value="male" className="bg-white dark:bg-zinc-900">Male</option>
            <option value="female" className="bg-white dark:bg-zinc-900">Female</option>
            <option value="non-binary" className="bg-white dark:bg-zinc-900">Non-binary</option>
            <option value="other" className="bg-white dark:bg-zinc-900">Other</option>
          </select>
        </label>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending}
        loading={pending}
        loadingText="Reserving tickets…"
      >
        <Lock className="mr-1.5 h-4 w-4" />
        Pay securely — {totalRupees}
      </Button>
      <p className="text-center text-xs text-muted">
        UPI, cards and netbanking via Razorpay. Your tickets are held for a few
        minutes while you pay.
      </p>
    </form>
  );
}