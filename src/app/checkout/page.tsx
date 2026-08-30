import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CheckoutForm } from "@/components/checkout/checkout-form";
import { QrCode } from "@/components/ui/qr-code";
import { MAX_TICKETS_PER_ORDER } from "@/lib/constants";
import { getEvent } from "@/lib/data/events";
import { formatDateTime, formatPaise } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { calculatePrice } from "@/lib/pricing";
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
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/checkout?event=${eventId}&tier=${tierId}&qty=${quantity}`)}`,
    );
  }

  const event = await getEvent(eventId);
  const tier = event?.tiers.find((item) => item.id === tierId);
  if (!event || !tier) notFound();

  const price = calculatePrice(tier.pricePaise, quantity, event.feePayer);
  const intent = upiIntent({
    upiId: event.organizer.upiId ?? "outsiderr@upi",
    payeeName: event.organizer.name,
    amountPaise: price.totalPaise,
    note: `${event.title} - ${tier.name}`,
  });

  return (
    <div className="mx-auto max-w-4xl py-6">
      <Link href={`/events/${event.id}`} className="text-sm text-muted hover:text-violet-neon">
        ← Back to event
      </Link>
      <h1 className="mt-2 text-3xl font-black tracking-tight">Checkout</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="glass rounded-3xl p-6">
          <h2 className="mb-4 text-base font-bold">Confirm your payment</h2>
          <CheckoutForm
            eventId={event.id}
            tierId={tier.id}
            quantity={quantity}
            defaultName={user.name}
            defaultPhone={user.phone ?? ""}
          />
        </div>

        <aside className="space-y-4">
          <div className="glass rounded-3xl p-5">
            <p className="text-sm font-bold">{event.title}</p>
            <p className="text-xs text-muted">
              {formatDateTime(event.startsAt)} · {event.venueName}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label={`${tier.name} × ${quantity}`} value={formatPaise(price.subtotalPaise)} />
              {event.feePayer === "BUYER" ? (
                <Row label="Platform fee (5%)" value={formatPaise(price.platformFeePaise)} />
              ) : (
                <Row label="Platform fee" value="Paid by organizer" />
              )}
              <div className="border-t border-zinc-200 pt-2 dark:border-white/10">
                <Row label="Total payable" value={formatPaise(price.totalPaise)} strong />
              </div>
            </dl>
          </div>

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
          </div>
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
    <div className="flex items-center justify-between gap-4">
      <dt className={strong ? "font-bold" : "text-muted"}>{label}</dt>
      <dd className={strong ? "text-lg font-black" : ""}>{value}</dd>
    </div>
  );
}
