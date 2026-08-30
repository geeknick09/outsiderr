"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BellRing, Check, Minus, Plus, Sparkles } from "lucide-react";

import { joinWaitlistAction } from "@/actions/waitlist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MAX_TICKETS_PER_ORDER } from "@/lib/constants";
import { formatPaise } from "@/lib/format";
import { calculatePrice } from "@/lib/pricing";
import type { EventDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TicketTiers({ event }: { event: EventDetail }) {
  const router = useRouter();
  const available = event.tiers.filter((tier) => tier.quantity > tier.quantitySold);
  const [selectedId, setSelectedId] = useState(available[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);

  const selected = event.tiers.find((tier) => tier.id === selectedId);
  const remaining = selected ? selected.quantity - selected.quantitySold : 0;
  const maxQuantity = Math.min(MAX_TICKETS_PER_ORDER, remaining);
  const price = selected
    ? calculatePrice(selected.pricePaise, quantity, event.feePayer)
    : null;

  function changeQuantity(delta: number) {
    setQuantity((value) => Math.min(maxQuantity, Math.max(1, value + delta)));
  }

  return (
    <section id="tickets" className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold">Select tickets</h2>
        <span className="text-xs text-muted">Max {MAX_TICKETS_PER_ORDER} per order</span>
      </div>

      <div className="space-y-3">
        {event.tiers.map((tier) => {
          const soldOut = tier.quantitySold >= tier.quantity;
          const isSelected = tier.id === selectedId;
          return (
            <button
              key={tier.id}
              type="button"
              disabled={soldOut}
              onClick={() => {
                setSelectedId(tier.id);
                setQuantity(1);
              }}
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition-all",
                isSelected
                  ? "border-violet-neon bg-violet-neon/10 shadow-glow-violet"
                  : "border-zinc-200 hover:border-violet-neon/50 dark:border-white/10",
                soldOut && "cursor-not-allowed opacity-50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold">
                    {tier.name}
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
                  <p className="mt-1 text-[11px] text-muted">
                    {soldOut
                      ? "Sold out"
                      : `${tier.quantity - tier.quantitySold} left`}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected && price ? (
        <div className="mt-5 space-y-4 border-t border-zinc-200 pt-5 dark:border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Quantity</span>
            <div className="flex items-center gap-3">
              <QuantityButton
                label="Decrease quantity"
                disabled={quantity <= 1}
                onClick={() => changeQuantity(-1)}
              >
                <Minus className="h-4 w-4" />
              </QuantityButton>
              <span className="w-6 text-center text-base font-bold">{quantity}</span>
              <QuantityButton
                label="Increase quantity"
                disabled={quantity >= maxQuantity}
                onClick={() => changeQuantity(1)}
              >
                <Plus className="h-4 w-4" />
              </QuantityButton>
            </div>
          </div>

          <dl className="space-y-1.5 text-sm">
            <Row label="Ticket subtotal" value={formatPaise(price.subtotalPaise)} />
            {event.feePayer === "BUYER" ? (
              <Row
                label="Platform fee (5%)"
                value={formatPaise(price.platformFeePaise)}
              />
            ) : (
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Platform fee</span>
                <Badge tone="success">Covered by organizer</Badge>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 text-base font-black">
              <dt>Total payable</dt>
              <dd>{formatPaise(price.totalPaise)}</dd>
            </div>
          </dl>

          <Button
            className="w-full"
            size="lg"
            onClick={() =>
              router.push(
                `/checkout?event=${event.id}&tier=${selected.id}&qty=${quantity}`,
              )
            }
          >
            Book now
          </Button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-semibold text-muted">All tiers sold out</p>
          {event.tiers.map((tier) => (
            <WaitlistJoinRow
              key={tier.id}
              tierId={tier.id}
              eventId={event.id}
              tierName={tier.name}
            />
          ))}
        </div>
      )}
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

function QuantityButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="glass flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function WaitlistJoinRow({
  tierId,
  eventId,
  tierName,
}: {
  tierId: string;
  eventId: string;
  tierName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [joined, setJoined] = useState(false);

  function handleJoin() {
    startTransition(async () => {
      await joinWaitlistAction(eventId, tierId);
      setJoined(true);
    });
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/10">
      <span className="text-sm font-semibold">{tierName}</span>
      {joined ? (
        <span className="flex items-center gap-1.5 text-xs text-lime-neon">
          <Check className="h-3.5 w-3.5" /> On waitlist
        </span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={handleJoin}
          className="flex items-center gap-1.5 text-xs font-semibold text-violet-neon hover:underline disabled:opacity-50"
        >
          <BellRing className="h-3.5 w-3.5" />
          {pending ? "Joining…" : "Join Waitlist"}
        </button>
      )}
    </div>
  );
}
