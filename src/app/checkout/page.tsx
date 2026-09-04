import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CheckoutForm } from "@/components/checkout/checkout-form";
import { QrCode } from "@/components/ui/qr-code";
import { MAX_TICKETS_PER_ORDER } from "@/lib/constants";
import { getEvent } from "@/lib/data/events";
import { getFeeTiers, getOrganizerWhatsappNumber } from "@/lib/data/platform-settings";
import { formatDateTime, formatPaise } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { calculatePrice, getFeeBpsForPrice } from "@/lib/pricing";
import { upiIntent } from "@/lib/upi";

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

  const user = await getCurrentUser();
  const nextUrl = `/checkout?event=${eventId}&tier=${tierId}&qty=${quantity}`;

  const event = await getEvent(eventId);
  const tier = event?.tiers.find((item) => item.id === tierId);
  if (!event || !tier) notFound();

  const isFree = tier.pricePaise === 0;
  // Use admin-configured commission tiers
  const feeTiers = await getFeeTiers();
  const feeBps = getFeeBpsForPrice(tier.pricePaise, feeTiers);
  const price = calculatePrice(tier.pricePaise, quantity, event.feePayer, feeBps);
  const intent = upiIntent({
    upiId: event.organizer.upiId ?? "outsiderr@upi",
    payeeName: event.organizer.name,
    amountPaise: price.totalPaise,
    note: `${event.title} - ${tier.name}`,
  });
  const whatsappNumber = await getOrganizerWhatsappNumber();

  return (
    <div className="mx-auto max-w-4xl py-6">
      <Link href={`/events/${event.id}`} className="text-sm text-muted hover:text-violet-neon">
        ← Back to event
      </Link>
      <h1 className="mt-2 text-3xl font-black tracking-tight">
        {isFree ? "Confirm your RSVP" : "Checkout"}
      </h1>

      {/* Login prompt for non-logged-in users */}
      {!user ? (
        <div className="mt-6 glass rounded-3xl p-8 text-center">
          <p className="text-base font-bold">Please sign in to continue</p>
          <p className="mt-2 text-sm text-muted">
            You need an account to {isFree ? "RSVP" : "book tickets"}. It&apos;s quick and free.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(nextUrl)}`}
            className="mt-4 inline-block rounded-2xl bg-violet-neon px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            Sign in / Sign up
          </Link>
        </div>
      ) : null}

      <div className={`mt-6 grid gap-6 lg:grid-cols-[1fr_360px] ${!user ? "opacity-50 pointer-events-none" : ""}`}>
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
            isFree={isFree}
          />
        </div>

        <aside className="space-y-4">
          <div className="glass rounded-3xl p-5">
            <p className="text-sm font-bold">{event.title}</p>
            <p className="text-xs text-muted">
              {formatDateTime(event.startsAt)} · {event.venueName}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label={`${tier.name} × ${quantity}`} value={isFree ? "Free" : formatPaise(price.subtotalPaise)} />
              {!isFree && event.feePayer === "BUYER" ? (
              <Row label={`Platform fee (${Math.round(price.feeBps / 100)}%)`} value={formatPaise(price.platformFeePaise)} />
              ) : null}
              {!isFree && event.feePayer === "ORGANIZER" ? (
                <Row label="Platform fee" value="Paid by organizer" />
              ) : null}
              {!isFree ? (
                <div className="border-t border-zinc-200 pt-2 dark:border-white/10">
                  <Row label="Total payable" value={formatPaise(price.totalPaise)} strong />
                </div>
              ) : null}
            </dl>
          </div>

          {/* UPI payment card — only for paid events */}
          {!isFree ? (
            <div className="glass flex flex-col items-center gap-3 rounded-3xl p-5 text-center">
              <p className="text-sm font-bold">Pay via UPI</p>
              {event.organizer.upiQrUrl ? (
                <Image
                  src={event.organizer.upiQrUrl}
                  alt={`${event.organizer.name} UPI QR`}
                  width={200}
                  height={200}
                  className="rounded-2xl bg-white p-2"
                />
              ) : (
                <QrCode value={intent} size={200} className="rounded-2xl bg-white p-2" />
              )}
              <p className="text-xs text-muted">
                {event.organizer.upiId ?? "outsiderr@upi"} · {event.organizer.name}
              </p>
              <p className="text-xs text-muted">
                Scan with any UPI app, pay {formatPaise(price.totalPaise)}, then submit the UTR.
              </p>
              <div className="mt-2 rounded-xl bg-violet-neon/10 p-3 text-xs text-violet-neon">
                <p className="font-bold">After payment:</p>
                <p className="mt-1">
                  Send your payment screenshot to{" "}
                  <a
                    href={`https://wa.me/91${whatsappNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold underline"
                  >
                    WhatsApp +91 {whatsappNumber}
                  </a>
                  . Your ticket will be shared via email or WhatsApp after the organizer
                  confirms your payment.
                </p>
              </div>
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
