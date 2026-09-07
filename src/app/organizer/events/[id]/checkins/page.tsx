import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { getOrganizerProfile } from "@/lib/data/organizer";
import { listEventTickets } from "@/lib/data/admin";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const event = await getEvent((await params).id);
  return { title: event ? `Check-ins: ${event.title} — Outsiderr` : "Check-ins — Outsiderr" };
}

export default async function EventCheckInsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const { id } = await params;
  const [organizer, event] = await Promise.all([
    getOrganizerProfile(user),
    getEvent(id),
  ]);

  if (!organizer) redirect("/organizer");
  if (!event) notFound();

  // Verify ownership — organizer must own this event
  if (event.organizer.ownerId !== user.id) {
    notFound();
  }

  const tickets = await listEventTickets(id);
  const checkedIn = tickets.filter((t) => t.status === "USED");
  const notCheckedIn = tickets.filter((t) => t.status === "VALID");
  const cancelled = tickets.filter((t) => t.status === "CANCELLED");

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <Link
          href={`/organizer/events/${event.id}`}
          className="flex items-center gap-1 text-sm text-muted hover:text-violet-neon"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to event
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-lime-neon" />
          <h1 className="text-2xl font-black tracking-tight">Check-ins</h1>
        </div>
        <p className="mt-1 text-sm font-semibold">{event.title}</p>
        <p className="text-xs text-muted">
          {checkedIn.length} checked in · {notCheckedIn.length} not checked in · {cancelled.length} cancelled
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted">Checked in</p>
          <p className="text-2xl font-black text-lime-neon">{checkedIn.length}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted">Not checked in</p>
          <p className="text-2xl font-black">{notCheckedIn.length}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted">Cancelled</p>
          <p className="text-2xl font-black text-red-500">{cancelled.length}</p>
        </div>
      </div>

      {/* Checked-in list */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Checked-in attendees ({checkedIn.length})</h2>
        {checkedIn.length === 0 ? (
          <div className="glass rounded-2xl p-5 text-sm text-muted">
            No one has checked in yet.
          </div>
        ) : (
          <div className="glass overflow-hidden rounded-2xl">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 dark:border-white/10">
                <tr>
                  <th className="px-3 py-2 font-semibold text-muted">Ticket #</th>
                  <th className="px-3 py-2 font-semibold text-muted">Tier</th>
                  <th className="px-3 py-2 font-semibold text-muted">Checked in at</th>
                  <th className="px-3 py-2 font-semibold text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {checkedIn.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-zinc-100 dark:border-white/5">
                    <td className="px-3 py-2 font-mono text-[10px] text-muted">
                      {ticket.qrHash.slice(0, 12)}…
                    </td>
                    <td className="px-3 py-2">{ticket.tierName}</td>
                    <td className="px-3 py-2 text-muted">
                      {ticket.checkedInAt ? formatDateTime(ticket.checkedInAt) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone="success">Checked In</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Not checked-in list */}
      {notCheckedIn.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Not checked in ({notCheckedIn.length})</h2>
          <div className="glass overflow-hidden rounded-2xl">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 dark:border-white/10">
                <tr>
                  <th className="px-3 py-2 font-semibold text-muted">Ticket #</th>
                  <th className="px-3 py-2 font-semibold text-muted">Tier</th>
                  <th className="px-3 py-2 font-semibold text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {notCheckedIn.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-zinc-100 dark:border-white/5">
                    <td className="px-3 py-2 font-mono text-[10px] text-muted">
                      {ticket.qrHash.slice(0, 12)}…
                    </td>
                    <td className="px-3 py-2">{ticket.tierName}</td>
                    <td className="px-3 py-2">
                      <Badge tone="violet">Valid</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
