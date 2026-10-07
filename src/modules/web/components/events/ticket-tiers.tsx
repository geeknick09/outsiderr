"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Check, Clock, Loader2, Sparkles, X } from "lucide-react";

import { joinWaitlistAction, leaveWaitlistAction } from "../../actions/waitlist";
import { Badge } from "@/modules/shared";
import { Button } from "@/modules/shared";
import { formatDateTime, formatPaise } from "@/modules/shared";
import { useRealtime } from "@/modules/shared";
import { computePhaseAvailability } from "@/modules/shared";
import { calculatePrice } from "@/modules/shared";
import type { EventDetail, TicketTier, WaitlistEntry } from "@/modules/shared";
import { cn } from "@/modules/shared";

export interface WaitlistTierData {
  tierId: string;
  entry: WaitlistEntry | null;
  count: number;
}

export function TicketTiers({
  event,
  waitlistData = [],
  waitlistEnabled = true,
  ticketsHeld = 0,
}: {
  event: EventDetail;
  waitlistData?: WaitlistTierData[];
  waitlistEnabled?: boolean;
  /** Tickets this user already holds for the event (server-computed). */
  ticketsHeld?: number;
}) {
  const router = useRouter();
  // Clock tick — re-evaluates phase/booking state without a refresh.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const nowMs = nowTick;
  const startMs = new Date(event.startsAt).getTime();
  const endMs = event.endsAt ? new Date(event.endsAt).getTime() : startMs;
  const eventStarted = startMs <= nowMs;
  const eventEnded = endMs <= nowMs;
  // Booking closes at start by default; at end if organizer allows booking during event
  const bookingClosed = event.allowBookingDuringEvent ? eventEnded : eventStarted;
  const [navigating, startNavigation] = useTransition();

  // Local tier state — updated in realtime when tickets are sold
  const [tiers, setTiers] = useState<TicketTier[]>(event.tiers);

  // Realtime: live tier quantity updates when someone books a ticket
  useRealtime({
    channelName: `event-tiers:${event.id}`,
    table: "ticket_tiers",
    event: "UPDATE",
    filter: `event_id=eq.${event.id}`,
    onPayload: ({ new: row }) => {
      setTiers((prev) =>
        prev.map((t) =>
          t.id === row.id
            ? {
                ...t,
                quantitySold: row.quantity_sold as number,
                quantityReserved: (row.quantity_reserved as number) ?? 0,
              }
            : t,
        ),
      );
    },
  });

  // All derived state memoized — nothing recalculates on every render
  const phaseTiers = useMemo(() => tiers.filter((t) => t.tierType === "FLAT_PHASE"), [tiers]);
  const namedTiers = useMemo(() => tiers.filter((t) => t.tierType !== "FLAT_PHASE"), [tiers]);
  const phaseAvailability = useMemo(
    () => computePhaseAvailability(phaseTiers, new Date(nowTick)),
    [phaseTiers, nowTick],
  );

  // Realtime phase flips: time-based boundaries (phase opens/closes, event
  // start/end) emit no DB event, so the realtime tier subscription can't see
  // them. This timer wakes at the NEXT boundary, bumps the clock, and the
  // availability recomputes — then re-arms for the one after it.
  useEffect(() => {
    const boundaries: number[] = [startMs, endMs];
    for (const t of phaseTiers) {
      if (t.phaseOpensAt) boundaries.push(new Date(t.phaseOpensAt).getTime());
      if (t.phaseClosesAt) boundaries.push(new Date(t.phaseClosesAt).getTime());
    }
    const next = boundaries.filter((b) => b > Date.now()).sort((a, b) => a - b)[0];
    if (!next) return;
    const delay = Math.min(next - Date.now() + 250, 2_147_000_000);
    const id = setTimeout(() => setNowTick(Date.now()), delay);
    return () => clearTimeout(id);
  }, [phaseTiers, nowTick, startMs, endMs]);
  const activePhase = useMemo(() => phaseAvailability.find((p) => p.isActive), [phaseAvailability]);
  const activePhaseTier = activePhase?.tier ?? null;

  const availableNamed = useMemo(
    () => namedTiers.filter((t) => t.quantity - t.quantitySold - (t.quantityReserved ?? 0) > 0),
    [namedTiers],
  );

  const bookableTiers = useMemo<TicketTier[]>(
    () => [...(activePhaseTier ? [activePhaseTier] : []), ...availableNamed],
    [activePhaseTier, availableNamed],
  );

  const [selectedId, setSelectedId] = useState(bookableTiers[0]?.id ?? "");

  // Per-user cap: event.maxTicketsPerUser (1–10) minus what they already hold.
  const perUserCap = Math.min(10, Math.max(1, event.maxTicketsPerUser ?? 5));
  const remainingCap = Math.max(0, perUserCap - ticketsHeld);
  const [qtyRaw, setQty] = useState(1);

  const isFreeEvent = useMemo(
    () => tiers.length > 0 && tiers.every((t) => t.pricePaise === 0),
    [tiers],
  );

  const selected = useMemo(
    () => bookableTiers.find((tier) => tier.id === selectedId),
    [bookableTiers, selectedId],
  );

  // Effective qty is clamped to remaining cap + tier stock at render time —
  // switching tiers can never leave the count out of bounds.
  const tierLeft = selected
    ? selected.quantity - selected.quantitySold - (selected.quantityReserved ?? 0)
    : 0;
  const maxQty = Math.min(remainingCap, tierLeft);
  const qty = Math.min(Math.max(1, qtyRaw), Math.max(1, maxQty));

  const price = useMemo(
    () =>
      selected
        ? calculatePrice(selected.pricePaise, qty, event.feePayer, undefined, {
            commissionBps: event.commissionBps,
            commissionEnabled: event.commissionEnabled,
            convenienceFeeBps: event.convenienceFeeBps,
            convenienceFeeEnabled: event.convenienceFeeEnabled,
          })
        : null,
    [selected, qty, event.feePayer, event.commissionBps, event.commissionEnabled, event.convenienceFeeBps, event.convenienceFeeEnabled],
  );

  const hasPhases = phaseTiers.length > 0;

  // Memoized navigation handler
  const handleBook = useCallback(() => {
    if (!selected || remainingCap <= 0) return;
    startNavigation(() =>
      router.push(`/checkout?event=${event.id}&tier=${selected.id}&qty=${qty}`),
    );
  }, [selected, qty, remainingCap, event.id, router, startNavigation]);

  // Sold-out phase state — computed once, not in an IIFE inside JSX
  const soldOutPhaseState = useMemo(() => {
    if (!hasPhases || bookableTiers.length > 0) return null;
    const allUpcoming = phaseAvailability.length > 0 && phaseAvailability.every((p) => p.isUpcoming);
    const allClosedOrSoldOut =
      phaseAvailability.length > 0 &&
      phaseAvailability.every((p) => p.isPast || p.status === "SOLD_OUT" || p.status === "CLOSED");
    const nextUpcoming = phaseAvailability.find((p) => p.isUpcoming);
    return { allUpcoming, allClosedOrSoldOut, nextUpcoming };
  }, [hasPhases, bookableTiers.length, phaseAvailability]);

  // Waitlist tiers — memoized
  const waitlistTiers = useMemo(() => {
    if (!waitlistEnabled) return [];
    return tiers.filter((tier) => {
      if (tier.tierType !== "FLAT_PHASE") {
        return tier.quantity - tier.quantitySold - (tier.quantityReserved ?? 0) <= 0;
      }
      const phase = phaseAvailability.find((p) => p.tier.id === tier.id);
      if (!phase) return false;
      return phase.status === "SOLD_OUT";
    });
  }, [waitlistEnabled, tiers, phaseAvailability]);

  return (
    <section id="tickets" className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold">
          {isFreeEvent ? "Free Entry — RSVP" : "Select tickets"}
        </h2>
        <span className="text-xs text-muted">Max {perUserCap} per person</span>
      </div>

      {/* Phase timeline — show all phases with their status */}
      {hasPhases ? (
        <div className="mb-4 space-y-2">
          {phaseAvailability.map((p) => {
            const isCurrent = p.isActive;
            const isUpcomingPhase = p.isUpcoming;
            const isClosed = p.isPast || p.status === "CLOSED" || p.status === "SOLD_OUT";
            return (
              <div
                key={p.tier.id}
                className={cn(
                  "flex items-center justify-between rounded-xl border p-2.5 text-xs",
                  isCurrent
                    ? "border-violet-neon/40 bg-violet-neon/10"
                    : isUpcomingPhase
                    ? "border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/5"
                    : "border-zinc-200/50 opacity-50 dark:border-white/5",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("font-semibold", isCurrent ? "text-violet-neon" : "")}>
                    {p.tier.name}
                  </span>
                  <span className="font-bold">
                    {p.tier.pricePaise === 0 ? "Free" : formatPaise(p.tier.pricePaise)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isCurrent ? (
                    <Badge tone="violet">Active now</Badge>
                  ) : isUpcomingPhase ? (
                    <span className="flex items-center gap-1 text-muted">
                      <Clock className="h-3 w-3" />
                      Opens {formatDateTime(p.tier.phaseOpensAt!)}
                    </span>
                  ) : isClosed ? (
                    <Badge tone="neutral">{p.status === "SOLD_OUT" ? "Sold out" : "Closed"}</Badge>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Bookable tiers */}
      <div className="space-y-3">
        {bookableTiers.map((tier) => {
          const isPhase = tier.tierType === "FLAT_PHASE";
          const isSelected = tier.id === selectedId;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => setSelectedId(tier.id)}
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition-colors",
                isSelected
                  ? "border-violet-neon bg-violet-neon/10 shadow-glow-violet"
                  : "border-zinc-200 hover:border-violet-neon/50 dark:border-white/10",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold">
                    {tier.name}
                    {isPhase ? <Badge tone="violet">Current phase</Badge> : null}
                    {isSelected ? <Check className="h-4 w-4 text-violet-neon" /> : null}
                  </p>
                  {tier.perks.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {tier.perks.map((perk) => (
                        <li key={perk} className="flex items-center gap-1.5 text-xs text-muted">
                          <Sparkles className="h-3 w-3 text-pink-neon" />
                          {perk}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-sm font-black">
                    {tier.pricePaise === 0 ? "Free" : formatPaise(tier.pricePaise)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {bookingClosed ? (
        <div className="mt-5 space-y-3 border-t border-zinc-200 pt-5 dark:border-white/10">
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-center text-sm font-semibold text-amber-600 dark:text-amber-300">
            {eventEnded
              ? "This event has ended. Tickets are no longer available."
              : "This event has started. Online booking is closed. Please buy tickets on spot at the venue."}
          </div>
        </div>
      ) : selected && price ? (
        <div className="mt-5 space-y-4 border-t border-zinc-200 pt-5 dark:border-white/10">
          <input type="hidden" value={1} readOnly />

          {/* Quantity stepper — bounded by the per-user cap and tier stock */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">
              Tickets{ticketsHeld > 0 ? ` (you hold ${ticketsHeld})` : ""}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Fewer tickets"
                disabled={qty <= 1}
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-sm font-bold disabled:opacity-30 dark:border-white/10"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-black">{qty}</span>
              <button
                type="button"
                aria-label="More tickets"
                disabled={qty >= maxQty}
                onClick={() => setQty(Math.min(maxQty, qty + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-sm font-bold disabled:opacity-30 dark:border-white/10"
              >
                +
              </button>
            </div>
          </div>

          {!isFreeEvent ? (
            <dl className="space-y-1.5 text-sm">
              <Row label={`Ticket subtotal ×${qty}`} value={formatPaise(price.subtotalPaise)} />
              {price.convenienceFeePaise > 0 ? (
                <Row
                  label={`Convenience fee (${Math.round((price.convenienceFeePaise / price.subtotalPaise) * 100)}%)`}
                  value={formatPaise(price.convenienceFeePaise)}
                />
              ) : null}
              <div className="flex items-center-between pt-2 text-base font-black">
                <dt>Total payable</dt>
                <dd>{formatPaise(price.totalPaise)}</dd>
              </div>
            </dl>
          ) : (
            <div className="flex items-center justify-between text-base font-black">
              <span>Total</span>
              <span className="text-lime-neon">Free</span>
            </div>
          )}

          {remainingCap <= 0 ? (
            <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-center text-xs font-semibold text-amber-700 dark:text-amber-300">
              You already hold the maximum {perUserCap} ticket{perUserCap > 1 ? "s" : ""} for this event.
            </p>
          ) : (
            <Button
              className="w-full"
              size="lg"
              disabled={navigating}
              loading={navigating}
              loadingText={isFreeEvent ? "Opening RSVP…" : "Opening checkout…"}
              onClick={handleBook}
            >
              {isFreeEvent ? "RSVP now" : "Book now"}
            </Button>
          )}
        </div>
      ) : bookableTiers.length === 0 ? (
        <div className="mt-5 space-y-3">
          {hasPhases && soldOutPhaseState ? (
            <SoldOutPhaseMessage state={soldOutPhaseState} />
          ) : (
            <p className="text-sm font-semibold text-muted">All tiers sold out</p>
          )}
          {waitlistTiers.map((tier) => {
            const wl = waitlistData.find((w) => w.tierId === tier.id);
            return (
              <WaitlistJoinRow
                key={tier.id}
                tierId={tier.id}
                eventId={event.id}
                tierName={tier.name}
                waitlistEntry={wl?.entry ?? null}
                waitlistCount={wl?.count ?? 0}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

// Extracted from the IIFE — now a proper component that only re-renders when its props change
function SoldOutPhaseMessage({
  state,
}: {
  state: { allUpcoming: boolean; allClosedOrSoldOut: boolean; nextUpcoming: { tier: { name: string; phaseOpensAt?: string | null } } | undefined };
}) {
  const { allUpcoming, allClosedOrSoldOut, nextUpcoming } = state;
  if (allUpcoming && nextUpcoming) {
    return (
      <div className="rounded-2xl border border-violet-neon/30 bg-violet-neon/5 p-4 text-center">
        <p className="text-sm font-semibold text-violet-neon">Tickets open soon</p>
        <p className="mt-1 text-xs text-muted">
          First phase ({nextUpcoming.tier.name}) opens{" "}
          {formatDateTime(nextUpcoming.tier.phaseOpensAt!)}
        </p>
      </div>
    );
  }
  if (allClosedOrSoldOut) {
    return <p className="text-sm font-semibold text-muted">All phases are closed or sold out</p>;
  }
  return (
    <p className="text-sm font-semibold text-muted">
      {nextUpcoming
        ? `Next phase (${nextUpcoming.tier.name}) opens ${formatDateTime(nextUpcoming.tier.phaseOpensAt!)}`
        : "All phases sold out"}
    </p>
  );
}

function WaitlistJoinRow({
  tierId,
  eventId,
  tierName,
  waitlistEntry,
  waitlistCount,
}: {
  tierId: string;
  eventId: string;
  tierName: string;
  waitlistEntry: WaitlistEntry | null;
  waitlistCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [entry, setEntry] = useState<WaitlistEntry | null>(waitlistEntry);

  const handleJoin = useCallback(() => {
    startTransition(async () => {
      await joinWaitlistAction(eventId, tierId);
      setEntry({ id: "temp", tierId, eventId, createdAt: new Date().toISOString() } as WaitlistEntry);
    });
  }, [eventId, tierId]);

  const handleLeave = useCallback(() => {
    if (!entry) return;
    startTransition(async () => {
      await leaveWaitlistAction(entry.id, eventId);
      setEntry(null);
    });
  }, [entry, eventId]);

  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/10">
      <div>
        <span className="text-sm font-semibold">{tierName}</span>
        {waitlistCount > 0 ? (
          <span className="ml-2 text-xs text-muted">{waitlistCount} on waitlist</span>
        ) : null}
      </div>
      {entry ? (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-lime-neon">
            <Check className="h-3.5 w-3.5" /> On waitlist
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={handleLeave}
            className="flex items-center gap-1 text-xs text-muted hover:text-red-500 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            {pending ? "Leaving…" : "Leave"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={handleJoin}
          className="flex items-center gap-1.5 text-xs font-semibold text-violet-neon hover:underline disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
          {pending ? "Joining…" : "Join Waitlist"}
        </button>
      )}
    </div>
  );
}
