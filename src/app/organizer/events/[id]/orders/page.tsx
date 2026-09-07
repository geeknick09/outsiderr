import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Users } from "lucide-react";

import { AttendeesTable } from "@/components/organizer/attendees-table";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { getOrganizerProfile } from "@/lib/data/organizer";
import { listEventOrders, listEventTickets } from "@/lib/data/admin";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const event = await getEvent((await params).id);
  return { title: event ? `Orders: ${event.title} — Outsiderr` : "Orders — Outsiderr" };
}

export default async function EventOrdersPage({
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

  const [orders, tickets] = await Promise.all([
    listEventOrders(id),
    listEventTickets(id),
  ]);

  const confirmedOrders = orders.filter((o) => o.status === "CONFIRMED");

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
          <Users className="h-6 w-6 text-violet-neon" />
          <h1 className="text-2xl font-black tracking-tight">All Orders</h1>
        </div>
        <p className="mt-1 text-sm font-semibold">{event.title}</p>
        <p className="text-xs text-muted">
          {orders.length} total · {confirmedOrders.length} confirmed
        </p>
      </div>

      <AttendeesTable orders={orders} tickets={tickets} />
    </div>
  );
}
