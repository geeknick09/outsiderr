"use client";

import { useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";

import {
  handleBoostFailureAction,
  startBoostCheckoutAction,
  verifyBoostPaymentAction,
} from "../actions/boosts";
import { RazorpayCheckout } from "@/modules/shared";
import { formatPaise } from "@/modules/shared";
import { cn } from "@/modules/shared";
import type { BoostSlotPrice, CheckoutSession, EventSummary } from "@/modules/shared";

const DURATIONS = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
];

export function BoostPanel({
  events,
  slotPrices,
  occupiedSlots,
  preselectedEventId,
}: {
  events: EventSummary[];
  slotPrices: BoostSlotPrice[];
  occupiedSlots: number[];
  platformUpiId?: string; // unused post-Razorpay — kept for caller compat
  preselectedEventId?: string;
}) {
  const [eventId, setEventId] = useState(preselectedEventId ?? events[0]?.id ?? "");
  const [slot, setSlot] = useState<number | null>(null);
  const [days, setDays] = useState(7);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPrice = slotPrices.find((p) => p.slot === slot);
  // Price is per-day; total = daily price × number of days
  const dailyPaise = selectedPrice ? selectedPrice.pricePaise : 0;
  const totalPaise = dailyPaise * days;

  async function handleSubmit() {
    if (!eventId || !slot) {
      setError("Select an event and a slot.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await startBoostCheckoutAction({ eventId, slot, days });
      if (result.error || !result.session) {
        setError(result.error ?? "Could not start payment.");
        return;
      }
      setSession(result.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="glass flex flex-col items-center gap-4 rounded-3xl p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-lime-neon" />
        <div>
          <p className="text-lg font-bold">Event featured!</p>
          <p className="mt-1 text-sm text-muted">
            Your event is now live in slot {slot}. It will appear in the Featured Events carousel for {days} days.
          </p>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <RazorpayCheckout
        session={session}
        verifyAction={verifyBoostPaymentAction}
        failureAction={handleBoostFailureAction}
        successRedirect="/organizer/boost?paid=1"
        onError={(msg) => {
          setSession(null);
          setError(msg);
        }}
        onCancel={() => setSession(null)}
      />
    );
  }

  const INPUT =
    "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

  return (
    <div className="space-y-6">
      {/* Step 1 — pick event */}
      <section className="glass space-y-3 rounded-3xl p-5">
        <h3 className="text-sm font-bold">1. Select event to boost</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted">Create an event first.</p>
        ) : (
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={INPUT}>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        )}
      </section>

      {/* Step 2 — pick slot */}
      <section className="glass space-y-3 rounded-3xl p-5">
        <h3 className="text-sm font-bold">2. Choose a featured slot (1 = top)</h3>
        <div className="grid grid-cols-5 gap-2">
          {slotPrices.map((sp) => {
            const taken = occupiedSlots.includes(sp.slot);
            const selected = slot === sp.slot;
            return (
              <button
                key={sp.slot}
                type="button"
                disabled={taken}
                onClick={() => setSlot(sp.slot)}
                className={cn(
                  "flex flex-col items-center rounded-2xl border p-2 text-xs transition-all",
                  selected
                    ? "border-violet-neon bg-violet-neon/10 text-violet-neon shadow-glow-violet"
                    : taken
                    ? "cursor-not-allowed border-zinc-200 opacity-40 dark:border-white/10"
                    : "border-zinc-200 hover:border-violet-neon/50 dark:border-white/10",
                )}
              >
                <span className="text-base font-black">{sp.slot}</span>
                <span className="text-muted">{formatPaise(sp.pricePaise)}/day</span>
                {taken ? <span className="mt-0.5 text-[9px] text-red-400">Taken</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 3 — duration */}
      <section className="glass space-y-3 rounded-3xl p-5">
        <h3 className="text-sm font-bold">3. Boost duration</h3>
        <div className="flex gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.days}
              type="button"
              onClick={() => setDays(d.days)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition-all",
                days === d.days
                  ? "border-violet-neon bg-violet-neon/10 text-violet-neon"
                  : "border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        {slot ? (
          <p className="text-sm font-semibold">
            {formatPaise(dailyPaise)}/day × {days} days = <span className="text-violet-neon">{formatPaise(totalPaise)}</span>
          </p>
        ) : null}
      </section>

      {/* Step 4 — pay online */}
      {slot && totalPaise ? (
        <section className="glass space-y-4 rounded-3xl p-5">
          <h3 className="text-sm font-bold">4. Pay & activate</h3>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-neon-gradient py-3 text-sm font-bold text-white shadow-glow-violet transition-opacity disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            {submitting ? "Preparing payment…" : `Pay ${formatPaise(totalPaise)}`}
          </button>
          <p className="text-center text-xs text-muted">
            UPI, cards and netbanking via Razorpay — the slot activates instantly.
          </p>
        </section>
      ) : null}

      <p className="px-2 text-center text-xs text-muted">
        Slots 1–10 appear in the featured carousel. Slot 1 is the top position. Your boost goes live
        the moment payment clears.
      </p>
    </div>
  );
}
