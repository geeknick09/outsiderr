import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { PrintButton } from "@/components/organizer/print-button";
import { QrCode } from "@/components/ui/qr-code";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { listMyTickets } from "@/lib/data/orders";
import { formatDateTime } from "@/lib/format";

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

  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

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

        {/* Booking receipt */}
        <div className="mt-6 border-t border-zinc-200 pt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
            Booking Receipt
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
            <div className="flex justify-between">
              <span className="text-zinc-500">Generated</span>
              <span className="font-semibold">{generatedAt}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400">
          <p>This is a platform booking receipt from Outsiderr.</p>
          <p>Present the QR code above at the venue for entry.</p>
        </div>
      </div>
    </div>
  );
}
