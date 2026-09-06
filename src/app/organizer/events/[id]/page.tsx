import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { BarChart2, ChevronLeft, LayoutDashboard, ScanLine } from "lucide-react";

import { AnalyticsPanel } from "@/components/organizer/analytics-panel";
import { AttendeesTable } from "@/components/organizer/attendees-table";
import { EditEventForm } from "@/components/organizer/edit-event-form";
import { CancelPostponeButtons } from "@/components/organizer/cancel-postpone-buttons";
import { DoorStaffPaymentPanel } from "@/components/organizer/door-staff-payment";
import { DoorStaffRequest } from "@/components/organizer/door-staff-request";
import { HeroBoostPanel } from "@/components/organizer/hero-boost-panel";
import { PastEventGalleryManager } from "@/components/organizer/past-event-gallery-manager";
import { ShareButton } from "@/components/events/share-button";
import { WaitlistPanel } from "@/components/organizer/waitlist-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { getDoorStaffOrder } from "@/lib/data/door-staff";
import { getOrganizerEventAnalytics } from "@/lib/data/organizer";
import { listEventOrders, listEventTickets } from "@/lib/data/admin";
import { expireWaitlistOffers, listEventWaitlist } from "@/lib/data/waitlist";
import { publishEventAction } from "@/actions/events";
import { getCancellationChargePercent, getPostponementChargePercent, getDoorStaffPricing, getDoorStaffAvailable, getHeroBoostPrice, getHeroBoostDurationDays } from "@/lib/data/platform-settings";
import { getHeroBoostForEvent } from "@/lib/data/hero-boosts";
import { formatDateRange, isPast } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const event = await getEvent((await params).id);
  return { title: event ? `Manage: ${event.title} — Outsiderr` : "Manage Event — Outsiderr" };
}

export default async function ManageEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const { id } = await params;

  const [event, analytics, cancelChargePct, postponeChargePct, doorStaffOrder, doorStaffPricing, doorStaffAvailable, heroBoost, heroBoostPrice, heroBoostDuration, orders, tickets, waitlistEntries] = await Promise.all([
    getEvent(id),
    getOrganizerEventAnalytics(user, id),
    getCancellationChargePercent(),
    getPostponementChargePercent(),
    getDoorStaffOrder(id),
    getDoorStaffPricing(),
    getDoorStaffAvailable(),
    getHeroBoostForEvent(user, id),
    getHeroBoostPrice(),
    getHeroBoostDurationDays(),
    listEventOrders(id),
    listEventTickets(id),
    listEventWaitlist(id),
  ]);

  // Expire stale waitlist offers (best-effort, non-blocking)
  try { await expireWaitlistOffers(); } catch { /* ignore */ }

  if (!event || !analytics) notFound();

  const eventPast = isPast(event.startsAt);

  const statusTone =
    eventPast
      ? "neutral"
      : event.status === "PUBLISHED"
      ? "success"
      : event.status === "CANCELLED" || event.status === "CANCELLATION_REQUESTED"
      ? "danger"
      : event.status === "POSTPONED"
      ? "violet"
      : "neutral";

  const statusLabel =
    eventPast
      ? "Completed"
      : event.status === "PUBLISHED"
      ? "Live"
      : event.status === "CANCELLED"
      ? "Cancelled"
      : event.status === "CANCELLATION_REQUESTED"
      ? "Cancelling…"
      : event.status === "POSTPONED"
      ? "Postponed"
      : "Draft";

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Link href="/organizer" className="text-muted hover:text-violet-neon">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-black tracking-tight">{event.title}</h1>
          <p className="text-sm text-muted">{formatDateRange(event.startsAt, event.endsAt)}</p>
        </div>
        <Link href="/organizer">
          <Button variant="secondary" size="sm">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone="violet">{CATEGORY_LABELS[event.category]}</Badge>
        <Badge tone={statusTone}>{statusLabel}</Badge>
        {event.isFeatured ? <Badge tone="lime">Boosted</Badge> : null}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href={`/events/${event.id}`} target="_blank">
          <Button variant="secondary" size="sm">View event page ↗</Button>
        </Link>
        <Link href={`/organizer/events/${event.id}/report`}>
          <Button variant="secondary" size="sm">
            <BarChart2 className="h-4 w-4" />
            Print report
          </Button>
        </Link>
        <ShareButton
          url={`/events/${event.id}`}
          title={event.title}
          variant="secondary"
          size="sm"
        />
        {eventPast ? null : (
          <Link href={`/organizer/events/${event.id}/scan`}>
            <Button size="sm">
              <ScanLine className="h-4 w-4" />
              Door Scanner
            </Button>
          </Link>
        )}
        {event.status === "DRAFT" && !eventPast ? (
          <form>
            <SubmitButton
              formAction={async () => {
                "use server";
                await publishEventAction(event.id);
              }}
              loadingText="Publishing…"
              className="rounded-2xl bg-neon-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90"
            >
              Publish event
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {/* Analytics */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Analytics</h2>
        <AnalyticsPanel analytics={analytics} />
      </section>

      {analytics.waitlistCount > 0 ? (
        <WaitlistPanel waitlistCount={analytics.waitlistCount} entries={waitlistEntries} />
      ) : null}

      {/* Attendees / Orders list */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Attendees ({orders.length})</h2>
        {orders.length === 0 ? (
          <div className="glass rounded-2xl p-5 text-sm text-muted">
            No bookings yet.
          </div>
        ) : (
          <AttendeesTable orders={orders} tickets={tickets} />
        )}
      </section>

      {/* Edit form — disabled for cancelled and past events */}
      {event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast ? (
        <EditEventForm event={event} />
      ) : null}

      {/* Front Row — disabled for cancelled and past events */}
      {event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast ? (
        <HeroBoostPanel
          eventId={event.id}
          boost={heroBoost}
          pricePaise={heroBoostPrice}
          durationDays={heroBoostDuration}
          eventStartsAt={event.startsAt}
          platformUpiId={process.env.NEXT_PUBLIC_PLATFORM_UPI_ID ?? "outsiderr@upi"}
        />
      ) : null}

      {/* Slot Boost — link to boost page, disabled for past events */}
      {event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast ? (
        <section className="glass rounded-3xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold">Slot Boost</h2>
              <p className="mt-1 text-sm text-muted">
                Get your event featured in the homepage carousel slots.
              </p>
            </div>
            <Link
              href={`/organizer/boost?event=${event.id}`}
              className="shrink-0 rounded-full bg-neon-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90"
            >
              Boost Event
            </Link>
          </div>
        </section>
      ) : null}

      {/* Door staff — disabled for this release (kept in admin only) */}
      {/* eventPast ? null : doorStaffOrder ? (
        <DoorStaffPaymentPanel
          order={doorStaffOrder}
          platformUpiId={process.env.NEXT_PUBLIC_PLATFORM_UPI_ID ?? "outsiderr@upi"}
        />
      ) : (event.status === "PUBLISHED" || event.status === "DRAFT") ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Door Staff</h2>
          <DoorStaffRequest
            eventId={event.id}
            pricing={doorStaffPricing}
            maxStaff={Math.min(5, doorStaffAvailable)}
          />
        </section>
      ) : null */}

      {/* Cancel / Postpone — disabled for past events */}
      {!eventPast && (event.status === "PUBLISHED" || event.status === "POSTPONED") ? (
        <section className="rounded-3xl border border-red-500/30 p-5">
          <h2 className="text-base font-bold text-red-500">Event actions</h2>
          <p className="mt-1 text-sm text-muted">
            Cancel or postpone this event. Ticket holders will be notified automatically.
          </p>
          <div className="mt-4">
            <CancelPostponeButtons
              event={event}
              cancellationChargePercent={cancelChargePct}
              postponementChargePercent={postponeChargePct}
            />
          </div>
        </section>
      ) : null}

      {/* Past events — allow gallery photo deletion only */}
      {eventPast ? (
        <PastEventGalleryManager eventId={event.id} photoUrls={event.photoUrls} />
      ) : null}
    </div>
  );
}
