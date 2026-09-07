import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { PrintButton } from "@/components/organizer/print-button";
import { QrCode } from "@/components/ui/qr-code";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { listMyTickets } from "@/lib/data/orders";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatPaise } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Print Ticket — Outsiderr" };
}

export default async function PrintTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: ticketId } = await params;
  const tickets = await listMyTickets(user);
  const ticket = tickets.find((t) => t.id === ticketId);
  if (!ticket) notFound();

  const event = await getEvent(ticket.eventId);
  if (!event) notFound();

  // Fetch the order for invoice details
  const supabase = await createClient();
  const { data: orderRow } = await supabase
    .from("orders")
    .select("id, invoice_number, razorpay_payment_id, payment_method, total_paise, subtotal_paise, convenience_fee_paise, commission_paise, quantity, unit_price_paise, confirmed_at, buyer_name, buyer_email")
    .eq("id", ticket.orderId)
    .maybeSingle();

  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const isFree = (orderRow?.total_paise ?? 0) === 0;

  return (
    <div className="min-h-screen bg-white px-8 py-10 text-zinc-900 dark:bg-white dark:text-zinc-900">
      {/* Back + Print — hidden when printing */}
      <div className="mb-8 flex items-center justify-between print:hidden">
        <Link
          href="/tickets"
          className="flex items-center gap-1 text-sm font-semibold text-violet-neon hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to tickets
        </Link>
        <PrintButton />
      </div>

      {/* Ticket + Receipt document */}
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="mb-6 border-b border-zinc-200 pb-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Outsiderr · Event Ticket
          </p>
          <h1 className="mt-1 text-2xl font-black">{event.title}</h1>
          {orderRow?.invoice_number ? (
            <p className="mt-1 text-xs font-mono text-zinc-500">
              Invoice: {orderRow.invoice_number}
            </p>
          ) : null}
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center py-6">
          <div className="rounded-2xl bg-white p-4 shadow-lg">
            <QrCode value={ticket.qrHash} size={200} className="rounded-lg" />
          </div>
          <p className="mt-2 font-mono text-[10px] text-zinc-500">
            {ticket.qrHash.slice(0, 32)}…
          </p>
        </div>

        {/* Ticket details */}
        <div className="space-y-2 border-t border-zinc-200 py-4 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Tier</span>
            <span className="font-semibold">{ticket.tierName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Date & Time</span>
            <span className="font-semibold">{formatDateTime(ticket.startsAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Venue</span>
            <span className="font-semibold">{ticket.venueName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Status</span>
            <span className="font-semibold">
              {ticket.status === "USED" ? "Scanned" : ticket.status === "CANCELLED" ? "Cancelled" : ticket.status === "VOID" ? "Void" : "Valid"}
            </span>
          </div>
          {ticket.checkedInAt ? (
            <div className="flex justify-between">
              <span className="text-zinc-500">Checked in at</span>
              <span className="font-semibold">{formatDateTime(ticket.checkedInAt)}</span>
            </div>
          ) : null}
        </div>

        {/* Booking receipt / Invoice */}
        <div className="mt-6 border-t border-zinc-200 pt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
            {isFree ? "Booking Receipt" : "Payment Receipt"}
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Organizer</span>
              <span className="font-semibold">{event.organizer.name}</span>
            </div>
            {event.contactEmail ? (
              <div className="flex justify-between">
                <span className="text-zinc-500">Organizer contact</span>
                <span className="font-semibold">{event.contactEmail}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-zinc-500">Ticket ID</span>
              <span className="font-mono text-xs">{ticket.id.slice(0, 12)}</span>
            </div>
            {orderRow?.invoice_number ? (
              <div className="flex justify-between">
                <span className="text-zinc-500">Invoice</span>
                <span className="font-mono text-xs">{orderRow.invoice_number}</span>
              </div>
            ) : null}
            {orderRow?.razorpay_payment_id ? (
              <div className="flex justify-between">
                <span className="text-zinc-500">Payment ID</span>
                <span className="font-mono text-xs">{orderRow.razorpay_payment_id.slice(0, 20)}…</span>
              </div>
            ) : null}
            {orderRow?.payment_method ? (
              <div className="flex justify-between">
                <span className="text-zinc-500">Payment method</span>
                <span className="font-semibold capitalize">{orderRow.payment_method}</span>
              </div>
            ) : null}
            {orderRow?.confirmed_at ? (
              <div className="flex justify-between">
                <span className="text-zinc-500">Paid on</span>
                <span className="font-semibold">{formatDateTime(orderRow.confirmed_at)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-zinc-500">Generated</span>
              <span className="font-semibold">{generatedAt}</span>
            </div>
          </div>

          {/* Fee breakdown — only for paid tickets */}
          {!isFree && orderRow ? (
            <div className="mt-4 space-y-1.5 border-t border-zinc-200 pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">
                  Ticket price × {orderRow.quantity}
                </span>
                <span className="font-semibold">{formatPaise(orderRow.subtotal_paise)}</span>
              </div>
              {orderRow.convenience_fee_paise > 0 ? (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Convenience fee</span>
                  <span className="font-semibold">{formatPaise(orderRow.convenience_fee_paise)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-zinc-200 pt-1.5">
                <span className="font-bold">Total paid</span>
                <span className="font-black">{formatPaise(orderRow.total_paise)}</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer with legal text */}
        <div className="mt-6 border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400">
          <p>
            Outsiderr is an intermediary platform connecting event organizers with attendees.
            {!isFree ? " A commission is deducted from the organizer's payout." : ""}
            {" "}This is not a tax invoice.
          </p>
          <p className="mt-1">
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
