import { redirect } from "next/navigation";

import { TicketsRealtimeWrapper } from "@/components/tickets/tickets-realtime-wrapper";
import { ReviewForm } from "@/components/reviews/review-form";
import { getCurrentUser } from "@/lib/auth";
import { listMyOrders, listMyTickets } from "@/lib/data/orders";
import { getOrganizerWhatsappNumber } from "@/lib/data/platform-settings";
import { getReviewableEvents } from "@/lib/data/reviews";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Tickets — Outsiderr" };

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; review?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Ftickets");

  const { submitted, review } = await searchParams;
  const [orders, tickets, whatsappNumber, reviewableEvents] = await Promise.all([
    listMyOrders(user),
    listMyTickets(user),
    getOrganizerWhatsappNumber(),
    getReviewableEvents(user.id),
  ]);

  // If review=eventId is in the URL, show the review form for that event
  const reviewEvent = review ? reviewableEvents.find((e) => e.eventId === review) : null;

  return (
    <div>
      {/* Review prompt for checked-in past events */}
      {reviewableEvents.length > 0 && !reviewEvent && (
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <div className="glass rounded-2xl p-4">
            <p className="text-sm font-bold">Share your experience</p>
            <p className="mt-1 text-xs text-muted">
              You checked in to these events. Leave a review to help others discover great organizers.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {reviewableEvents.map((e) => (
                <a
                  key={e.eventId}
                  href={`/tickets?review=${e.eventId}`}
                  className="rounded-xl border border-violet-neon/30 bg-violet-neon/10 px-3 py-1.5 text-xs font-semibold text-violet-neon transition-colors hover:bg-violet-neon/20"
                >
                  Review: {e.eventTitle}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Review form (when an event is selected) */}
      {reviewEvent && (
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <a href="/tickets" className="text-xs text-muted hover:text-violet-neon">
              ← Back to tickets
            </a>
          </div>
          <ReviewForm eventId={reviewEvent.eventId} eventTitle={reviewEvent.eventTitle} />
        </div>
      )}

      <TicketsRealtimeWrapper
        userId={user.id}
        userName={user.name}
        whatsappNumber={whatsappNumber}
        submitted={!!submitted}
        initialOrders={orders}
        initialTickets={tickets}
      />
    </div>
  );
}
