"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

import {
  createCheckoutAction,
  getPaymentStatusAction,
  handlePaymentFailureAction,
  verifyPaymentAction,
} from "@/modules/web/actions/orders";
import { Button, PhoneInput, RazorpayCheckout } from "@/modules/shared";
import type { CheckoutSession } from "@/modules/shared";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

/**
 * Paid checkout - collects buyer details, then reserves inventory + opens
 * Razorpay Checkout (UPI/card/netbanking). Manual-UPI/UTR flows were removed
 * in the Razorpay migration.
 */
export function RazorpayCheckoutForm({
  eventId,
  inviteToken,
  tierId,
  quantity,
  defaultName,
  defaultPhone,
  defaultEmail,
  defaultGender,
  totalRupees,
  showPromoCode = false,
}: {
  eventId: string;
  inviteToken?: string | null;
  tierId: string;
  quantity: number;
  defaultName: string;
  defaultPhone: string;
  defaultEmail: string;
  defaultGender: string;
  totalRupees: string;
  /** Event opted into PROMO_CODE mode - show the code field. */
  showPromoCode?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [pending, startTransition] = useTransition();
  // Set while we resolve what happened to the last attempt - the Pay button
  // stays disabled so the user can't stack a second payment on a first one
  // that's still confirming server-side.
  const [resolving, setResolving] = useState(false);

  // After the modal returns (dismiss or error), check the intent before
  // re-arming the Pay button: a capture may be mid-flight via the webhook.
  async function resolveBeforeRetry(closedSession: CheckoutSession, err?: string) {
    setResolving(true);
    try {
      const status = await getPaymentStatusAction({ orderId: closedSession.orderId });
      if (status && (status.status === "PAID" || status.refStatus === "CONFIRMED" || status.refStatus === "REFUND_REQUESTED")) {
        router.push(`/checkout/status?order=${closedSession.orderId}&event=${eventId}`);
        return;
      }
    } catch {
      // fall through - re-arm the form
    }
    setSession(null);
    setResolving(false);
    setError(err ?? null);
  }

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

  // Payment window opened - RazorpayCheckout auto-opens the modal.
  if (session) {
    return (
      <RazorpayCheckout
        session={session}
        verifyAction={verifyPaymentAction}
        failureAction={handlePaymentFailureAction}
        successRedirect={`/checkout/status?order=${session.orderId}`}
        statusRedirect={`/checkout/status?order=${session.orderId}&event=${eventId}`}
        onError={(msg) => void resolveBeforeRetry(session, msg)}
        onCancel={() => void resolveBeforeRetry(session)}
      />
    );
  }

  if (resolving) {
    return (
      <div className="rounded-2xl border border-zinc-200 p-6 text-center dark:border-white/10">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-violet-600" />
        <p className="text-sm font-semibold text-muted">
          Checking your payment status…
        </p>
        <Button className="mt-4 w-full" size="lg" disabled loading loadingText="Checking…">
          Pay securely
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      {inviteToken ? <input type="hidden" name="inviteToken" value={inviteToken} /> : null}
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

      {showPromoCode ? (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Promo code <span className="normal-case text-zinc-400">(optional)</span>
          </span>
          <input name="promoCode" placeholder="Promoter's code" autoComplete="off" className={INPUT} />
        </label>
      ) : null}

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
        Pay securely - {totalRupees}
      </Button>
      <p className="text-center text-xs text-muted">
        UPI, cards and netbanking via Razorpay. Your price &amp; tickets are
        locked for 15 minutes once you proceed.
      </p>
    </form>
  );
}