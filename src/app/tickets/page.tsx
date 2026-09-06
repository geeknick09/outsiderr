import { redirect } from "next/navigation";

import { TicketsRealtimeWrapper } from "@/components/tickets/tickets-realtime-wrapper";
import { getCurrentUser } from "@/lib/auth";
import { listMyOrders, listMyTickets } from "@/lib/data/orders";
import { getOrganizerWhatsappNumber } from "@/lib/data/platform-settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Tickets — Outsiderr" };

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Ftickets");

  const { submitted } = await searchParams;
  const [orders, tickets, whatsappNumber] = await Promise.all([
    listMyOrders(user),
    listMyTickets(user),
    getOrganizerWhatsappNumber(),
  ]);

  return (
    <TicketsRealtimeWrapper
      userId={user.id}
      userName={user.name}
      whatsappNumber={whatsappNumber}
      submitted={!!submitted}
      initialOrders={orders}
      initialTickets={tickets}
    />
  );
}
