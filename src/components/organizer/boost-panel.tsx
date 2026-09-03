"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { requestBoostAction } from "@/actions/boosts";
import { QrCode } from "@/components/ui/qr-code";
import { formatPaise } from "@/lib/format";
import { upiIntent } from "@/lib/upi";
import { cn } from "@/lib/utils";
import type { BoostSlotPrice, EventSummary } from "@/lib/types";

const DURATIONS = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
];

export function BoostPanel({
  events,
  slotPrices,
  occupiedSlots,
  platformUpiId,
  preselectedEventId,
}: {
  events: EventSummary[];
  slotPrices: BoostSlotPrice[];
  occupiedSlots: number[];
  platformUpiId: string;
  preselectedEventId?: string;
}) {
  const [eventId, setEventId] = useState(preselectedEventId ?? events[0]?.id ?? "");
  const [slot, setSlot] = useState<number | null>(null);
  const [days, setDays] = useState(7);
  const [utr, setUtr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPrice = slotPrices.find((p) => p.slot === slot);
  // Price is per-day; total = daily price × number of days
  const dailyPaise = selectedPrice ? selectedPrice.pricePaise : 0;
  const totalPaise = dailyPaise * days;

  const upiString =
    slot && totalPaise
      ? upiIntent({
          upiId: platformUpiId,
          payeeName: "Outsiderr",
          amountPaise: totalPaise,
          note: `Boost slot ${slot} — ${events.find((e) => e.id === eventId)?.title ?? "event"}`,
        })
      : null;

  async function handleSubmit() {
    if (!eventId || !slot || !utr.trim()) {
      setError("Select an event, a slot, and enter your UTR.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const startsAt = new Date().toISOString();
      const endsAt = new Date(Date.now() + days * 86_400_000).toISOString();
      await requestBoostAction({ eventId, slot, amountPaidPaise: totalPaise, startsAt, endsAt, utrReference: utr.trim() });
      setSuccess(true);
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

      {/* Step 4 — pay + UTR */}
      {upiString ? (
        <section className="glass space-y-4 rounded-3xl p-5">
          <h3 className="text-sm font-bold">4. Pay & submit UTR</h3>
          <div className="flex justify-center">
            <QrCode value={upiString} size={180} className="rounded-2xl bg-white p-2" />
          </div>
          <p className="text-center text-xs text-muted">
            Scan with any UPI app to pay {formatPaise(totalPaise)} to Outsiderr
          </p>
          <input
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            placeholder="Enter UTR / transaction reference"
            className={INPUT}
          />
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <button
            type="button"
            disabled={submitting || !utr.trim()}
            onClick={handleSubmit}
            className="w-full rounded-2xl bg-neon-gradient py-3 text-sm font-bold text-white shadow-glow-violet transition-opacity disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit Boost Request"}
          </button>
        </section>
      ) : null}

      <p className="px-2 text-center text-xs text-muted">
        Slots 1–10 appear in the featured carousel. Slot 1 is the top position. Admin will verify
        your UTR before the boost goes live.
      </p>
    </div>
  );
}
