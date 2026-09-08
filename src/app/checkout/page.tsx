import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CheckoutForm } from "@/components/checkout/checkout-form";
import { UpiQrCode } from "@/components/checkout/upi-qr-code";
import { MAX_TICKETS_PER_ORDER } from "@/lib/constants";
import { getEvent } from "@/lib/data/events";
import { formatDateTime, formatPaise } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { calculatePrice } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Checkout — Outsiderr" };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; tier?: string; qty?: string }>;
}) {
  const { event: eventId, tier: tierId, qty } = await searchParams;
  if (!eventId || !tierId) redirect("/");

  const quantity = Math.min(
    Math.max(Number(qty ?? 1) || 1, 1),
    MAX_TICKETS_PER_ORDER,
  );

  // Fetch user and event in parallel — saves one sequential DB round-trip
  const [user, event] = await Promise.all([getCurrentUser(), getEvent(eventId)]);
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

  // Check if user has already booked a ticket for this event
  const supabase = await createClient();
  const { count: existingOrderCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("user_id", user.id)
    .in("status", ["CONFIRMED", "PENDING_VERIFICATION", "RESERVED"]);
  const alreadyBooked = (existingOrderCount ?? 0) > 0;

  // Use per-event commission + convenience fee config
  const price = calculatePrice(tier.pricePaise, quantity, event.feePayer, undefined, {
    commissionBps: event.commissionBps,
    commissionEnabled: event.commissionEnabled,
    convenienceFeeBps: event.convenienceFeeBps,
    convenienceFeeEnabled: event.convenienceFeeEnabled,
  });

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
              Each attendee can book up to {MAX_TICKETS_PER_ORDER} ticket{MAX_TICKETS_PER_ORDER > 1 ? "s" : ""} per event.
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
            {isFree ? "Your details" : "Confirm your payment"}
          </h2>
          <CheckoutForm
            eventId={event.id}
            tierId={tier.id}
            quantity={quantity}
            defaultName={user?.name ?? ""}
            defaultPhone={user?.phone ?? ""}
            defaultEmail={user?.email ?? ""}
            defaultGender={user?.gender ?? ""}
            isFree={isFree}
            totalRupees={formatPaise(price.totalPaise)}
            organizerUpiId={event.organizer.upiId}
            organizerPhone={event.contactPhone ?? null}
            organizerName={event.organizer.name}
          />
        </div>

        <aside className="space-y-4">
          {/* QR code for UPI payment — shown above the ticket payable box */}
          {!isFree && event.organizer.upiId ? (
            <div className="glass rounded-3xl p-5">
              <UpiQrCode
                upiId={event.organizer.upiId}
                payeeName={event.organizer.name}
                amountPaise={price.totalPaise}
                note={`Outsiderr tickets — ${quantity} ticket(s)`}
                size={180}
              />
            </div>
          ) : null}

          <div className="glass rounded-3xl p-5">
            <p className="text-sm font-bold">{event.title}</p>
            <p className="text-xs text-muted">
              {formatDateTime(event.startsAt)} · {event.venueName}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label={`${tier.name} × ${quantity}`} value={isFree ? "Free" : formatPaise(price.subtotalPaise)} />
              {!isFree && price.convenienceFeePaise > 0 ? (
                <Row label={`Convenience fee (${Math.round(price.convenienceFeePaise / price.subtotalPaise * 100)}%)`} value={formatPaise(price.convenienceFeePaise)} />
              ) : null}
              {!isFree ? (
                <div className="border-t border-zinc-200 pt-2 dark:border-white/10">
                  <Row label="Total payable" value={formatPaise(price.totalPaise)} strong />
                </div>
              ) : null}
            </dl>
          </div>

          {!isFree ? (
            <div className="glass rounded-3xl p-5 text-center">
              <p className="text-sm font-bold text-violet-neon">Secure Manual payment</p>
              <p className="mt-1 text-xs text-muted">
                Pay the organizer directly via UPI (GPay/PhonePe). After paying, submit your
                booking — the organizer will verify and confirm your ticket.
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
  label: string;
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
