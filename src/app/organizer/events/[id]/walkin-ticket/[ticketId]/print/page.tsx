import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { PrintButton } from "@/components/organizer/print-button";
import { QrCode } from "@/components/ui/qr-code";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { getOrganizerProfile } from "@/lib/data/organizer";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Walk-in Ticket — Outsiderr" };
}

export default async function WalkinTicketPrintPage({
  params,
}: {
  params: Promise<{ id: string; ticketId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: eventId, ticketId } = await params;

  // Verify organizer owns this event
  const organizer = await getOrganizerProfile(user);
  if (!organizer) notFound();

  const supabase = await createClient();
  const { data: eventRow } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", organizer.id)
    .maybeSingle();
  if (!eventRow) notFound();

  // Fetch the ticket
  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, qr_hash, status, checked_in_at, order_id, tier_id")
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!ticket) notFound();

  // Fetch event + tier + order details
  const [event, tierRes, orderRes] = await Promise.all([
    getEvent(eventId),
    supabase.from("ticket_tiers").select("name").eq("id", ticket.tier_id).maybeSingle(),
    supabase
      .from("orders")
      .select("id, subtotal_paise, total_paise, buyer_name, buyer_email, buyer_phone, confirmed_at, order_source")
      .eq("id", ticket.order_id)
      .maybeSingle(),
  ]);
  if (!event) notFound();

  const tierName = tierRes.data?.name ?? "Ticket";
  const order = orderRes.data;
  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const isFree = (order?.total_paise ?? 0) === 0;

  return (
    <div className="min-h-screen bg-white px-8 py-10 text-zinc-900 dark:bg-white dark:text-zinc-900">
      {/* Back + Print — hidden when printing */}
      <div className="mb-8 flex items-center justify-between print:hidden">
        <Link
          href={`/organizer/events/${eventId}`}
          className="flex items-center gap-1 text-sm font-semibold text-violet-neon hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to event
        </Link>
        <PrintButton />
      </div>

      {/* Ticket document */}
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="mb-6 border-b border-zinc-200 pb-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Outsiderr · Walk-in Ticket
          </p>
          <h1 className="mt-1 text-2xl font-black">{event.title}</h1>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center py-6">
          <div className="rounded-2xl bg-white p-4 shadow-lg">
            <QrCode value={ticket.qr_hash} size={200} className="rounded-lg" />
          </div>
          <p className="mt-2 font-mono text-[10px] text-zinc-500">
            {ticket.qr_hash.slice(0, 32)}…
          </p>
        </div>

        {/* Ticket details */}
        <div className="space-y-2 border-t border-zinc-200 py-4 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Tier</span>
            <span className="font-semibold">{tierName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Date & Time</span>
            <span className="font-semibold">{formatDateTime(event.startsAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Venue</span>
            <span className="font-semibold">{event.venueName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Status</span>
            <span className="font-semibold">
              {ticket.status === "USED" ? "Scanned" : ticket.status === "CANCELLED" ? "Cancelled" : "Valid"}
            </span>
          </div>
          {ticket.checked_in_at ? (
            <div className="flex justify-between">
              <span className="text-zinc-500">Checked in at</span>
              <span className="font-semibold">{formatDateTime(ticket.checked_in_at)}</span>
            </div>
          ) : null}
        </div>

        {/* Attendee details */}
        <div className="mt-6 border-t border-zinc-200 pt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
            Attendee Details
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Name</span>
              <span className="font-semibold">{order?.buyer_name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Phone</span>
              <span className="font-semibold">{order?.buyer_phone ?? "—"}</span>
            </div>
            {order?.buyer_email ? (
              <div className="flex justify-between">
                <span className="text-zinc-500">Email</span>
                <span className="font-semibold">{order.buyer_email}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-zinc-500">Ticket ID</span>
              <span className="font-mono text-xs">{ticket.id.slice(0, 12)}</span>
            </div>
            {order?.confirmed_at ? (
              <div className="flex justify-between">
                <span className="text-zinc-500">Registered on</span>
                <span className="font-semibold">{formatDateTime(order.confirmed_at)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-zinc-500">Generated</span>
              <span className="font-semibold">{generatedAt}</span>
            </div>
          </div>

          {/* Amount paid */}
          {!isFree && order ? (
            <div className="mt-4 space-y-1.5 border-t border-zinc-200 pt-3 text-sm">
              <div className="flex justify-between border-t border-zinc-200 pt-1.5">
                <span className="font-bold">Amount paid</span>
                <span className="font-black">
                  {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
                    (order.total_paise ?? 0) / 100,
                  )}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="mt-6 border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400">
          <p>
            Present the QR code above at the venue for entry.
          </p>
          <p className="mt-1">
            For refund policy, visit outsiderr.in/legal/terms
          </p>
        </div>
      </div>
    </div>
  );
}
