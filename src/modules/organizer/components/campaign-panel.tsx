"use client";

import { useState } from "react";
import { Info, Rocket, LayoutGrid, Megaphone, CheckCircle2 } from "lucide-react";

import {
  createHeroBoostCheckoutAction,
  verifyHeroBoostPaymentAction,
  handleHeroBoostFailureAction,
} from "@/modules/shared/actions/hero-boosts";
import { RazorpayCheckout, formatPaise, cn } from "@/modules/shared";
import { BoostPanel } from "./boost-panel";
import type { BoostSlotPrice, CheckoutSession, EventSummary } from "@/modules/shared";

const PLACEMENTS = [
  { value: "HOME", label: "Home screen" },
  { value: "COMMUNITIES", label: "Communities" },
  { value: "BOTH", label: "Both surfaces" },
] as const;

type Tab = "FEATURE" | "SLOT" | "ADS";

export function CampaignPanel({
  events,
  slotPrices,
  occupiedSlots,
  featurePricePaise,
  featureMaxVisible,
  slotCount,
  preselectedEventId,
}: {
  preselectedEventId?: string;
  events: EventSummary[];
  slotPrices: BoostSlotPrice[];
  occupiedSlots: number[];
  featurePricePaise: number;
  featureMaxVisible: number;
  slotCount: number;
}) {
  const [tab, setTab] = useState<Tab>("FEATURE");

  return (
    <div className="space-y-5">
      {/* Explainer - what each campaign type does */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setTab("FEATURE")}
          className={cn(
            "glass rounded-3xl border p-4 text-left transition-all",
            tab === "FEATURE" ? "border-violet-neon shadow-glow-violet" : "hover:border-violet-neon/50",
          )}
        >
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-violet-neon" />
            <p className="text-sm font-bold">Feature</p>
            <Info className="h-3.5 w-3.5 text-muted" />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Your event shows in the big top carousel on the home screen - the first thing people
            see. Only {featureMaxVisible} spots run at a time. One flat price.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setTab("SLOT")}
          className={cn(
            "glass rounded-3xl border p-4 text-left transition-all",
            tab === "SLOT" ? "border-violet-neon shadow-glow-violet" : "hover:border-violet-neon/50",
          )}
        >
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-violet-neon" />
            <p className="text-sm font-bold">Slot boost</p>
            <Info className="h-3.5 w-3.5 text-muted" />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Pick a numbered slot in the sponsored strip (slot 1 = first). You choose where it shows
            and how many days it runs - price = slot rate x days, paid via Razorpay.
          </p>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["FEATURE", "SLOT", "ADS"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-all",
              tab === t
                ? "bg-neon-gradient text-white shadow-glow-violet"
                : "border border-zinc-200 text-muted hover:border-violet-neon dark:border-white/10",
            )}
          >
            {t === "FEATURE" ? "Feature" : t === "SLOT" ? "Slot boost" : "Ad campaigns"}
          </button>
        ))}
      </div>

      {tab === "FEATURE" ? (
        <FeaturePurchase events={events} pricePaise={featurePricePaise} preselectedEventId={preselectedEventId} />
      ) : tab === "SLOT" ? (
        <BoostPanel
          events={events}
          slotPrices={slotPrices}
          occupiedSlots={occupiedSlots}
          maxSlots={slotCount}
          preselectedEventId={preselectedEventId}
        />
      ) : (
        <section className="glass space-y-3 rounded-3xl p-8 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-muted" />
          <p className="text-lg font-bold">Ad campaigns - coming soon</p>
          <p className="mx-auto max-w-md text-sm text-muted">
            Run Instagram, Meta and WhatsApp ads for your event straight from here. We&apos;ll
            handle targeting and report reach + ticket clicks back on this tab.
          </p>
        </section>
      )}
    </div>
  );
}

/** Feature purchase card - event + placement picker → hero boost checkout. */
function FeaturePurchase({
  events,
  pricePaise,
  preselectedEventId,
}: {
  events: EventSummary[];
  pricePaise: number;
  preselectedEventId?: string;
}) {
  const [eventId, setEventId] = useState(preselectedEventId ?? events[0]?.id ?? "");
  const [placement, setPlacement] = useState<"HOME" | "COMMUNITIES" | "BOTH">("HOME");
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const INPUT =
    "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

  if (session) {
    return (
      <RazorpayCheckout
        session={session}
        verifyAction={verifyHeroBoostPaymentAction}
        failureAction={handleHeroBoostFailureAction}
        successRedirect="/organizer/campaigns?featured=1"
        onError={(msg) => {
          setSession(null);
          setError(msg);
        }}
        onCancel={() => setSession(null)}
      />
    );
  }

  async function buy() {
    if (!eventId) {
      setError("Select an event.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createHeroBoostCheckoutAction(eventId, placement);
      if (result.error || !result.session) {
        setError(result.error ?? "Could not start payment.");
        return;
      }
      setSession(result.session);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {events.length === 0 ? (
        <section className="glass rounded-3xl p-6 text-center">
          <p className="text-sm text-muted">Create an event first, then come back to feature it.</p>
        </section>
      ) : (
        <>
          <section className="glass space-y-3 rounded-3xl p-5">
            <h3 className="text-sm font-bold">1. Select event to feature</h3>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={INPUT}>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.title}</option>
              ))}
            </select>
          </section>
          <section className="glass space-y-3 rounded-3xl p-5">
            <h3 className="text-sm font-bold">2. Where should it show?</h3>
            <div className="flex gap-2">
              {PLACEMENTS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlacement(p.value)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition-all",
                    placement === p.value
                      ? "border-violet-neon bg-violet-neon/10 text-violet-neon"
                      : "border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>
          <section className="glass space-y-4 rounded-3xl p-5">
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            <button
              type="button"
              disabled={submitting}
              onClick={buy}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-neon-gradient py-3 text-sm font-bold text-white shadow-glow-violet transition-opacity disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? "Preparing payment…" : `Feature for ${formatPaise(pricePaise)}`}
            </button>
            <p className="text-center text-xs text-muted">
              UPI, cards and netbanking via Razorpay - goes live the moment payment clears.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
