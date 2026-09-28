import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Info, Lock } from "lucide-react";

import { CheckoutForm, RazorpayCheckoutForm } from "@/modules/web";
import { MAX_TICKETS_PER_ORDER } from "@/modules/shared";
import { getEvent } from "@/modules/shared/server";
import { formatDateTime, formatPaise } from "@/modules/shared";
import { getCurrentUser } from "@/modules/shared/server";
import { calculatePrice } from "@/modules/shared";
import { createClient } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Checkout — Outsiderr" };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; tier?: string; qty?: string }>;
}) {
  const { event: eventId, tier: tierId, qty } = await searchParams;
  if (!eventId || !tierId) redirect("/");

  // Fetch user and event in parallel — saves one sequential DB round-trip
  const [user, event] = await Promise.all([getCurrentUser(), getEvent(eventId)]);
  const tier0 = event?.tiers.find((item) => item.id === tierId);
  const perUserCap = Math.min(10, Math.max(1, event?.maxTicketsPerUser ?? 5));
  const quantity = Math.min(
    Math.max(Number(qty ?? 1) || 1, 1),
    perUserCap,
    MAX_TICKETS_PER_ORDER,
    tier0 ? Math.max(1, tier0.quantity - tier0.quantitySold - (tier0.quantityReserved ?? 0)) : 1,
  );
  const nextUrl = `/checkout?event=${eventId}&tier=${tierId}&qty=${quantity}`;
  const tier = event?.tiers.find((item) => item.id === tierId);
  if (!event || !tier) notFound();

  // Not logged in → show only the sign-in prompt, not the checkout form
  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16">
        <div className="glass rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-black tracking-tight">Please sign in to continue</h1>
          <p className="mt-3 text-sm text-muted">
            You need an account to {tier.pricePaise === 0 ? "RSVP" : "book tickets"}. It&apos;s quick and free.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(nextUrl)}`}
            className="mt-6 inline-block rounded-2xl bg-violet-neon px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            Sign in / Sign up
          </Link>
          <div className="mt-4">
            <Link href={`/events/${event.id}`} className="text-xs text-muted hover:text-violet-neon">
              ← Back to event
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isFree = tier.pricePaise === 0;

  // Per-user ticket cap — count tickets HELD (sum of quantity across orders),
  // not orders, since one order can carry up to the cap.
  const supabase = await createClient();
  const { data: heldOrders } = await supabase
    .from("orders")
    .select("quantity")
    .eq("event_id", event.id)
    .eq("user_id", user.id)
    .in("status", ["CONFIRMED", "PENDING_VERIFICATION", "RESERVED", "REFUND_REQUESTED"]);
  const ticketsHeld = (heldOrders ?? []).reduce((s, o) => s + (o.quantity ?? 0), 0);
  const alreadyBooked = ticketsHeld + quantity > perUserCap;
  const remainingCap = Math.max(0, perUserCap - ticketsHeld);
  const allowedQuantity = Math.min(quantity, remainingCap || 1);

  // Server-side price preview — the DB recomputes these authoritatively in
  // create_reserved_order; this is display-only.
  const price = calculatePrice(tier.pricePaise, allowedQuantity, event.feePayer, undefined, {
    commissionBps: event.commissionBps,
    commissionEnabled: event.commissionEnabled,
    convenienceFeeBps: event.convenienceFeeBps,
    convenienceFeeEnabled: event.convenienceFeeEnabled,
  });
  const buyerFee = price.convenienceFeePaise + price.gatewayFeePaise;

  return (
    <div className="mx-auto max-w-4xl py-6">
      <Link href={`/events/${event.id}`} className="text-sm text-muted hover:text-violet-neon">
        ← Back to event
      </Link>
      <h1 className="mt-2 text-3xl font-black tracking-tight">
        {isFree ? "Confirm your RSVP" : "Checkout"}
      </h1>

      {alreadyBooked ? (
        <div className="mx-auto max-w-md py-10">
          <div className="glass rounded-3xl p-8 text-center">
            <h2 className="text-xl font-black tracking-tight">
              You have already booked the max number of tickets permissible
            </h2>
            <p className="mt-3 text-sm text-muted">
              This event allows up to {perUserCap} ticket{perUserCap > 1 ? "s" : ""} per account
              {ticketsHeld > 0 ? ` — you already hold ${ticketsHeld}` : ""}.
              Check your existing ticket for this event.
            </p>
            <Link
              href="/tickets"
              className="mt-6 inline-block rounded-2xl bg-violet-neon px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              View my tickets
            </Link>
            <div className="mt-4">
              <Link href={`/events/${event.id}`} className="text-xs text-muted hover:text-violet-neon">
                ← Back to event
              </Link>
            </div>
          </div>
        </div>
      ) : (
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="glass rounded-3xl p-6">
          <h2 className="mb-4 text-base font-bold">
            {isFree ? "Your details" : "Payment details"}
          </h2>
          {isFree ? (
            <CheckoutForm
              eventId={event.id}
              tierId={tier.id}
              quantity={allowedQuantity}
              defaultName={user?.name ?? ""}
              defaultPhone={user?.phone ?? ""}
              defaultEmail={user?.email ?? ""}
              defaultGender={user?.gender ?? ""}
            />
          ) : (
            <RazorpayCheckoutForm
              eventId={event.id}
              tierId={tier.id}
              quantity={allowedQuantity}
              defaultName={user?.name ?? ""}
              defaultPhone={user?.phone ?? ""}
              defaultEmail={user?.email ?? ""}
              defaultGender={user?.gender ?? ""}
              totalRupees={formatPaise(price.totalPaise)}
            />
          )}
        </div>

        <aside className="space-y-4">
          <div className="glass rounded-3xl p-5">
            <p className="text-sm font-bold">{event.title}</p>
            <p className="text-xs text-muted">
              {formatDateTime(event.startsAt)} · {event.venueName}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label={`${tier.name} × ${allowedQuantity}`} value={isFree ? "Free" : formatPaise(price.subtotalPaise)} />
              {!isFree && buyerFee > 0 ? (
                <Row
                  label={
                    <span className="inline-flex items-center gap-1">
                      Convenience fee
                      <FeeTooltip
                        convenience={price.convenienceFeePaise}
                        gateway={price.gatewayFeePaise}
                      />
                    </span>
                  }
                  value={formatPaise(buyerFee)}
                />
              ) : null}
              {!isFree ? (
                <div className="border-t border-zinc-200 pt-2 dark:border-white/10">
                  <Row label="Total payable" value={formatPaise(price.totalPaise)} strong />
                </div>
              ) : null}
            </dl>
            {!isFree && buyerFee > 0 ? (
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                The convenience fee covers platform &amp; payment gateway costs and is
                non-refundable. On a cancellation your ticket price is refunded.
              </p>
            ) : null}
          </div>

          {!isFree ? (
            <div className="glass rounded-3xl p-5 text-center">
              <p className="inline-flex items-center gap-1.5 text-sm font-bold text-violet-neon">
                <Lock className="h-4 w-4" /> Secure payment via Razorpay
              </p>
              <p className="mt-1 text-xs text-muted">
                Pay by UPI, card or netbanking. Your tickets are confirmed the
                moment the payment succeeds — no screenshots, no waiting.
              </p>
              <p className="mt-2 text-xs text-muted">
                Outsiderr is an intermediary platform connecting event organizers with attendees.
              </p>
            </div>
          ) : (
            <div className="glass rounded-3xl p-5 text-center">
              <p className="text-sm font-bold text-lime-neon">Free Entry</p>
              <p className="mt-1 text-xs text-muted">
                No payment needed. You&apos;ll get an instant confirmed ticket with a QR code.
              </p>
            </div>
          )}
        </aside>
      </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: React.ReactNode;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={strong ? "font-black" : "text-muted"}>{label}</dt>
      <dd className={strong ? "font-black" : "font-semibold"}>{value}</dd>
    </div>
  );
}

/** Breaks the convenience fee down — platform fee + 2.36% payment gateway. */
function FeeTooltip({
  convenience,
  gateway,
}: {
  convenience: number;
  gateway: number;
}) {
  return (
    <span className="group relative inline-flex cursor-help text-zinc-400">
      <Info className="h-3.5 w-3.5" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-xl bg-zinc-900 px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 dark:bg-zinc-800">
        <span className="flex justify-between">
          <span>Platform fee</span>
          <span className="font-semibold">{formatPaise(convenience)}</span>
        </span>
        <span className="mt-1 flex justify-between">
          <span>Payment gateway (2.36%)</span>
          <span className="font-semibold">{formatPaise(gateway)}</span>
        </span>
        <span className="mt-2 block border-t border-white/10 pt-1.5 text-white/70">
          Covers processing and gateway costs — non-refundable.
        </span>
      </span>
    </span>
  );
}