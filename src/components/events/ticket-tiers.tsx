"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BellRing, Check, Clock, Loader2, Sparkles, X } from "lucide-react";


import { joinWaitlistAction, leaveWaitlistAction } from "@/actions/waitlist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/format";
import { computePhaseAvailability } from "@/lib/phases";
import { calculatePrice } from "@/lib/pricing";
import { isPast } from "@/lib/format";
import type { EventDetail, TicketTier, WaitlistEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface WaitlistTierData {
  tierId: string;
  entry: WaitlistEntry | null;
  count: number;
}

export function TicketTiers({
  event,
  feeBps,
  waitlistData = [],
}: {
  event: EventDetail;
  feeBps?: number;
  waitlistData?: WaitlistTierData[];
}) {
  const router = useRouter();
  const eventIsPast = isPast(event.startsAt);
  const [navigating, startNavigation] = useTransition();

  // Split tiers into phases and named tiers
  const phaseTiers = event.tiers.filter((t) => t.tierType === "FLAT_PHASE");
  const namedTiers = event.tiers.filter((t) => t.tierType !== "FLAT_PHASE");
  const phaseAvailability = computePhaseAvailability(phaseTiers);

  // Active phase is the one users can currently buy
  const activePhase = phaseAvailability.find((p) => p.isActive);
  const activePhaseTier = activePhase?.tier ?? null;

  // Bookable tiers: active phase + all named tiers with availability
  const availableNamed = namedTiers.filter((t) => t.quantity > t.quantitySold);
  const bookableTiers: TicketTier[] = [
    ...(activePhaseTier ? [activePhaseTier] : []),
    ...availableNamed,
  ];

  const [selectedId, setSelectedId] = useState(bookableTiers[0]?.id ?? "");

  const isFreeEvent = event.tiers.length > 0 && event.tiers.every((t) => t.pricePaise === 0);
  const selected = bookableTiers.find((tier) => tier.id === selectedId);
  const price = selected
    ? calculatePrice(selected.pricePaise, 1, event.feePayer, undefined, {
        commissionBps: event.commissionBps,
        commissionEnabled: event.commissionEnabled,
        convenienceFeeBps: event.convenienceFeeBps,
        convenienceFeeEnabled: event.convenienceFeeEnabled,
      })
    : null;

  const hasPhases = phaseTiers.length > 0;

  return (
    <section id="tickets" className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold">
          {isFreeEvent ? "Free Entry — RSVP" : "Select tickets"}
        </h2>
        <span className="text-xs text-muted">1 ticket per order</span>
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
                      Opens {new Date(p.tier.phaseOpensAt!).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
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
                "w-full rounded-2xl border p-4 text-left transition-all",
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
                        <li
                          key={perk}
                          className="flex items-center gap-1.5 text-xs text-muted"
                        >
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

      {eventIsPast ? (
        <div className="mt-5 space-y-3 border-t border-zinc-200 pt-5 dark:border-white/10">
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-center text-sm font-semibold text-amber-600 dark:text-amber-300">
            This event has ended. Tickets are no longer available.
          </div>
        </div>
      ) : selected && price ? (
        <div className="mt-5 space-y-4 border-t border-zinc-200 pt-5 dark:border-white/10">
          <input type="hidden" value={1} readOnly />

          {!isFreeEvent ? (
            <dl className="space-y-1.5 text-sm">
              <Row label="Ticket subtotal" value={formatPaise(price.subtotalPaise)} />
              {price.convenienceFeePaise > 0 ? (
                <Row
                  label={`Convenience fee (${Math.round(price.convenienceFeePaise / price.subtotalPaise * 100)}%)`}
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

          <Button
            className="w-full"
            size="lg"
            disabled={navigating}
            loading={navigating}
            loadingText={isFreeEvent ? "Opening RSVP…" : "Opening checkout…"}
            onClick={() =>
              startNavigation(() =>
                router.push(
                  `/checkout?event=${event.id}&tier=${selected.id}&qty=1`,
                ),
              )
            }
          >
            {isFreeEvent ? "RSVP now" : "Book now"}
          </Button>
        </div>
      ) : bookableTiers.length === 0 ? (
        <div className="mt-5 space-y-3">
          {hasPhases ? (
            // Phased event with no active phase — check if all upcoming, all closed, or all sold out
            (() => {
              const allUpcoming = phaseAvailability.length > 0 && phaseAvailability.every((p) => p.isUpcoming);
              const allClosedOrSoldOut = phaseAvailability.length > 0 && phaseAvailability.every((p) => p.isPast || p.status === "SOLD_OUT" || p.status === "CLOSED");
              const nextUpcoming = phaseAvailability.find((p) => p.isUpcoming);

              if (allUpcoming && nextUpcoming) {
                return (
                  <div className="rounded-2xl border border-violet-neon/30 bg-violet-neon/5 p-4 text-center">
                    <p className="text-sm font-semibold text-violet-neon">
                      Tickets open soon
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      First phase ({nextUpcoming.tier.name}) opens{" "}
                      {new Date(nextUpcoming.tier.phaseOpensAt!).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                );
              }

              if (allClosedOrSoldOut) {
                return (
                  <p className="text-sm font-semibold text-muted">
                    All phases are closed or sold out
                  </p>
                );
              }

              // Mixed state — some closed, some upcoming, none active
              return (
                <p className="text-sm font-semibold text-muted">
                  {nextUpcoming
                    ? `Next phase (${nextUpcoming.tier.name}) opens ${new Date(nextUpcoming.tier.phaseOpensAt!).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                    : "All phases sold out"}
                </p>
              );
            })()
          ) : (
            <p className="text-sm font-semibold text-muted">
              All tiers sold out
            </p>
          )}
          {event.tiers
            .filter((tier) => {
              // For phased events, only show waitlist for the ACTIVE phase that is sold out
              if (tier.tierType !== "FLAT_PHASE") return tier.quantitySold >= tier.quantity;
              const phase = phaseAvailability.find((p) => p.tier.id === tier.id);
              if (!phase) return false;
              // Only show waitlist for active phases that are sold out, not upcoming ones
              return phase.status === "SOLD_OUT";
            })
            .map((tier) => {
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

  function handleJoin() {
    startTransition(async () => {
      await joinWaitlistAction(eventId, tierId);
      // Optimistically update — revalidation will bring the real state
      setEntry({ id: "temp", tierId, eventId, createdAt: new Date().toISOString() } as WaitlistEntry);
    });
  }

  function handleLeave() {
    if (!entry) return;
    startTransition(async () => {
      await leaveWaitlistAction(entry.id, eventId);
      setEntry(null);
    });
  }

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
