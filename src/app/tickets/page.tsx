import { redirect } from "next/navigation";

import { TicketsRealtimeWrapper } from "@/modules/web";
import { ReviewForm } from "@/modules/web";
import { getCurrentUser } from "@/modules/shared/server";
import { listMyOrders, listMyTickets } from "@/modules/shared/server";
import { listMyRefunds } from "@/modules/shared/server";
import { getOrganizerWhatsappNumber } from "@/modules/shared/server";
import { getReviewableEvents } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Tickets - Outsiderr" };

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; review?: string; success?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Ftickets");

  const { submitted, review, success } = await searchParams;
  const [orders, tickets, refunds, whatsappNumber, reviewableEvents] = await Promise.all([
    listMyOrders(user),
    listMyTickets(user),
    listMyRefunds(user),
    getOrganizerWhatsappNumber(),
    getReviewableEvents(user.id),
  ]);

  // If review=eventId is in the URL, show the review form for that event
  const reviewEvent = review ? reviewableEvents.find((e) => e.eventId === review) : null;

  return (
    <div>
      {/* Booking confirmed - buyer auto-follows the organizer */}
      {success === "1" && (
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              Booking confirmed!
            </p>
            <p className="mt-1 text-xs text-muted">
              You&apos;re now following this organizer - you&apos;ll be first to
              know when they launch their next event. You can unfollow anytime
              from their profile.
            </p>
          </div>
        </div>
      )}

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
        initialRefunds={refunds}
      />
    </div>
  );
}
