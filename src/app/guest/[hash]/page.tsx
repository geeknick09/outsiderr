import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import { QrCode, Badge } from "@/modules/shared";
import { createServiceClient } from "@/modules/shared/server";
import { formatDateTime, cityLabel } from "@/modules/shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Guest Ticket - Outsiderr" };

/**
 * Public shareable guest ticket — keyed by the ticket's qr_hash (the same
 * secret the door scanner validates). No login required.
 */
export default async function GuestTicketPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  const supabase = createServiceClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, status, qr_hash, order_id, event_id")
    .eq("qr_hash", hash)
    .maybeSingle();
  if (!ticket) notFound();

  const [{ data: order }, { data: event }] = await Promise.all([
    supabase.from("orders").select("buyer_name, buyer_phone, order_source").eq("id", ticket.order_id).maybeSingle(),
    supabase.from("events").select("title, starts_at, ends_at, venue_name, city, card_poster_url").eq("id", ticket.event_id).maybeSingle(),
  ]);
  if (!event) notFound();

  return (
    <div className="mx-auto max-w-sm space-y-6 py-10">
      <div className="glass overflow-hidden rounded-3xl text-center">
        <div className="bg-neon-gradient p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80">Guest ticket</p>
          <h1 className="mt-1 text-2xl font-black">{event.title}</h1>
        </div>
        <div className="space-y-4 p-6">
          <div className="mx-auto w-fit rounded-3xl bg-white p-4">
            <QrCode value={ticket.qr_hash} size={200} />
          </div>
          <div>
            <p className="text-lg font-bold">{order?.buyer_name ?? "Guest"}</p>
            <Badge tone={ticket.status === "USED" ? "neutral" : "success"}>
              {ticket.status === "USED" ? "Checked in" : "Valid"}
            </Badge>
          </div>
          <div className="space-y-1 text-sm text-muted">
            <p>{formatDateTime(event.starts_at)}</p>
            <p>{event.venue_name} · {cityLabel(event.city)}</p>
          </div>
          <p className="text-xs text-muted">Show this QR at the door. One scan per guest.</p>
        </div>
      </div>
      <p className="text-center text-xs text-muted">
        Powered by <Link href="/" className="font-semibold text-violet-neon">Outsiderr</Link>
      </p>
    </div>
  );
}
