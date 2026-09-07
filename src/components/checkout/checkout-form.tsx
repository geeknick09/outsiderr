"use client";

import { useState, useTransition } from "react";

import { submitPaymentAction } from "@/actions/orders";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { upiIntent } from "@/lib/upi";

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
  totalPaise = 0,
  totalRupees = "0",
  organizerUpiId,
  organizerUpiQrUrl,
  organizerPhone,
  organizerName,
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
  organizerUpiId?: string | null;
  organizerUpiQrUrl?: string | null;
  organizerPhone?: string | null;
  organizerName?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("isFree", isFree ? "1" : "0");
    startTransition(async () => {
      const result = await submitPaymentAction({ error: null }, formData);
      if (result?.error) setError(result.error);
    });
  }

  // Build UPI intent link for the "Pay via GPay/PhonePe" button
  const upiLink =
    organizerUpiId && totalPaise > 0
      ? upiIntent({
          upiId: organizerUpiId,
          payeeName: organizerName ?? "Organizer",
          amountPaise: totalPaise,
          note: `Outsiderr tickets — ${quantity} ticket(s)`,
        })
      : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      {/* Paid events: show organizer payment instructions */}
      {!isFree ? (
        <div className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm dark:border-violet-500/30 dark:bg-violet-500/10">
          <div>
            <p className="font-bold text-violet-900 dark:text-violet-200">
              Pay ₹{totalRupees} to the organizer
            </p>
            <p className="mt-1 text-xs text-violet-800/80 dark:text-violet-300/80">
              Use any UPI app (GPay, PhonePe, Paytm) to pay the organizer directly.
              After paying, submit your booking below — the organizer will verify
              your payment and confirm your ticket.
            </p>
          </div>

          {/* UPI ID */}
          {organizerUpiId ? (
            <div className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 dark:bg-white/5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Organizer UPI ID</p>
                <p className="font-mono text-sm font-bold">{organizerUpiId}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(organizerUpiId).catch(() => {});
                }}
                className="rounded-lg bg-violet-neon px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
              >
                Copy
              </button>
            </div>
          ) : null}

          {/* QR code image */}
          {organizerUpiQrUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img
                src={organizerUpiQrUrl}
                alt="Organizer UPI QR code"
                className="h-40 w-40 rounded-xl bg-white object-contain"
              />
              <p className="text-xs text-muted">Scan this QR with any UPI app to pay</p>
            </div>
          ) : null}

          {/* Pay via UPI intent button */}
          {upiLink ? (
            <a
              href={upiLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-xl bg-violet-neon px-4 py-3 text-center text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              Open in UPI App
            </a>
          ) : null}

          {/* Organizer phone for screenshot */}
          {organizerPhone ? (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="font-semibold">For faster verification</p>
              <p className="mt-0.5">
                Send your GPay/PhonePe payment screenshot to{" "}
                <a
                  href={`tel:${organizerPhone}`}
                  className="font-bold underline"
                >
                  {organizerPhone}
                </a>{" "}
                (organizer). This helps them confirm your ticket quickly.
              </p>
            </div>
          ) : null}

          {/* Optional UTR reference */}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              UTR / Transaction ID <span className="normal-case text-zinc-400">(optional)</span>
              <InfoTooltip />
            </span>
            <input
              name="utrReference"
              className={INPUT}
              placeholder="e.g. 123456789012 (from your UPI app)"
            />
            <span className="block text-xs text-muted">
              Enter the transaction reference from your UPI app if available.
              This helps the organizer find your payment faster.
            </span>
          </label>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending}
        loading={pending}
        loadingText={isFree ? "Confirming…" : "Submitting booking…"}
      >
        {isFree ? "Confirm RSVP" : `Submit Booking — ₹${totalRupees}`}
      </Button>
      <p className="text-center text-xs text-muted">
        {isFree ? (
          <>
            You&apos;ll get an <strong>instantly confirmed</strong> ticket with a QR code — no
            payment or verification needed.
          </>
        ) : (
          <>
            After submitting, the organizer will verify your payment and confirm your ticket.
            You&apos;ll receive a notification once confirmed.
          </>
        )}
      </p>
    </form>
  );
}

/** Info tooltip explaining what UTR is and where to find it in GPay / PhonePe */
function InfoTooltip() {
  return (
    <span className="relative inline-flex align-middle">
      <span className="group inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-zinc-300 text-[10px] font-bold text-zinc-700 dark:bg-white/20 dark:text-white/80">
        i
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl bg-zinc-900 px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 dark:bg-zinc-800">
          <strong className="block text-violet-neon">What is UTR?</strong>
          <span className="mt-1 block">
            UTR (Unique Transaction Reference) is a 12-digit number that identifies your UPI payment. It helps the organizer find your payment faster.
          </span>
          <strong className="mt-2 block">Where to find it:</strong>
          <span className="mt-0.5 block">
            <strong>GPay:</strong> Open the payment → tap the transaction → &quot;Transaction ID&quot; or check the receipt. The UTR appears as a 12-digit reference number.
          </span>
          <span className="mt-0.5 block">
            <strong>PhonePe:</strong> Open the payment → tap &quot;View transaction&quot; → look for &quot;Transaction ID&quot; or &quot;UPI Reference ID&quot; (starts with &quot;T&quot; followed by digits).
          </span>
        </span>
      </span>
    </span>
  );
}
