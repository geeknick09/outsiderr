"use client";

import { useState, useTransition } from "react";

import { createCheckoutAction, submitPaymentAction } from "@/actions/orders";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { RazorpayCheckout } from "@/components/checkout/razorpay-checkout";
import type { CheckoutSession } from "@/lib/types";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function CheckoutForm({
  eventId,
  tierId,
  quantity,
  defaultName,
  defaultPhone,
  defaultEmail,
  defaultGender,
  isFree = false,
  totalRupees = "0",
}: {
  eventId: string;
  tierId: string;
  quantity: number;
  defaultName: string;
  defaultPhone: string;
  defaultEmail: string;
  defaultGender: string;
  isFree?: boolean;
  totalPaise?: number;
  totalRupees?: string;
}) {
  // Free flow: use the legacy submitPaymentAction (instant RSVP)
  const [freeError, setFreeError] = useState<string | null>(null);
  const [freePending, startFreeTransition] = useTransition();

  // Paid flow: createCheckoutAction → Razorpay Checkout
  const [paidError, setPaidError] = useState<string | null>(null);
  const [paidPending, startPaidTransition] = useTransition();
  const [session, setSession] = useState<CheckoutSession | null>(null);

  function handleFreeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFreeError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("isFree", "1");
    startFreeTransition(async () => {
      const result = await submitPaymentAction({ error: null }, formData);
      if (result?.error) setFreeError(result.error);
    });
  }

  function handlePaidSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPaidError(null);
    const formData = new FormData(e.currentTarget);
    startPaidTransition(async () => {
      const result = await createCheckoutAction(formData);
      if (result?.error) {
        setPaidError(result.error);
      } else if (result?.session) {
        setSession(result.session);
      }
    });
  }

  // Razorpay Checkout modal is open — show the checkout component
  if (session) {
    return (
      <RazorpayCheckout
        session={session}
        onError={(msg) => setPaidError(msg)}
        onCancel={() => setSession(null)}
      />
    );
  }

  return (
    <form onSubmit={isFree ? handleFreeSubmit : handlePaidSubmit} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="tierId" value={tierId} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="isFree" value={isFree ? "1" : "0"} />

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
            Please provide a correct phone number. The organizer may contact you for event details. Outsiderr is not responsible if the phone number you provide is incorrect.
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Email
          </span>
          <input
            name="buyerEmail"
            type="email"
            defaultValue={defaultEmail}
            required
            placeholder="you@example.com"
            className={INPUT}
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

      {/* Paid events: show secure payment notice (Razorpay) */}
      {!isFree ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
          <p className="font-semibold">Secure payment via Razorpay</p>
          <p className="mt-1 text-xs">
            You&apos;ll be redirected to Razorpay&apos;s secure checkout to complete your payment.
            We accept UPI, cards, net banking, and wallets. Your tickets will be confirmed
            instantly after payment — no manual verification needed.
          </p>
          <p className="mt-2 text-xs text-muted">
            Outsiderr is an intermediary platform connecting event organizers with attendees.
            A platform commission is deducted from the organizer&apos;s payout.
          </p>
        </div>
      ) : null}

      {isFree && freeError ? <p className="text-sm text-red-500">{freeError}</p> : null}
      {!isFree && paidError ? <p className="text-sm text-red-500">{paidError}</p> : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isFree ? freePending : paidPending}
        loading={isFree ? freePending : paidPending}
        loadingText={isFree ? "Confirming…" : "Opening payment…"}
      >
        {isFree ? "Confirm RSVP" : `Pay ₹${totalRupees}`}
      </Button>
      <p className="text-center text-xs text-muted">
        {isFree ? (
          <>
            You&apos;ll get an <strong>instantly confirmed</strong> ticket with a QR code — no
            payment or verification needed.
          </>
        ) : (
          <>
            Your tickets are reserved for <strong>15 minutes</strong>. Complete payment before
            the timer expires. Tickets are issued instantly on successful payment.
          </>
        )}
      </p>
    </form>
  );
}
