"use client";

import { useCallback, useState, useTransition } from "react";

import { submitPaymentAction } from "@/modules/web/actions/orders";
import { Button } from "@/modules/shared";
import { PhoneInput } from "@/modules/shared";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

/**
 * Free RSVP form — instant confirm, no payment. Paid checkout goes through
 * RazorpayCheckoutForm (manual-UPI/UTR was removed in the Razorpay migration).
 */
export function CheckoutForm({
  eventId,
  tierId,
  quantity,
  defaultName,
  defaultPhone,
  defaultEmail,
  defaultGender,
}: {
  eventId: string;
  tierId: string;
  quantity: number;
  defaultName: string;
  defaultPhone: string;
  defaultEmail: string;
  defaultGender: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      const formData = new FormData(e.currentTarget);
      formData.set("isFree", "1");
      startTransition(async () => {
        const result = await submitPaymentAction({ error: null }, formData);
        if (result?.error) setError(result.error);
      });
    },
    [startTransition],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="tierId" value={tierId} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="isFree" value="1" />

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
            Email <span className="normal-case text-zinc-400">(read-only)</span>
          </span>
          <input
            name="buyerEmail"
            type="email"
            defaultValue={defaultEmail}
            required
            readOnly
            placeholder="you@example.com"
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
        loadingText="Confirming…"
      >
        Confirm RSVP
      </Button>
      <p className="text-center text-xs text-muted">
        You&apos;ll get an <strong>instantly confirmed</strong> ticket with a QR code — no
        payment or verification needed.
      </p>
    </form>
  );
}