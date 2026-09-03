import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { BarChart2, ChevronLeft, LayoutDashboard, ScanLine } from "lucide-react";

import { AnalyticsPanel } from "@/components/organizer/analytics-panel";
import { EditEventForm } from "@/components/organizer/edit-event-form";
import { CancelPostponeButtons } from "@/components/organizer/cancel-postpone-buttons";
import { DoorStaffPaymentPanel } from "@/components/organizer/door-staff-payment";
import { DoorStaffRequest } from "@/components/organizer/door-staff-request";
import { HeroBoostPanel } from "@/components/organizer/hero-boost-panel";
import { ShareButton } from "@/components/events/share-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { getDoorStaffOrder } from "@/lib/data/door-staff";
import { getOrganizerEventAnalytics, updateEventStatus } from "@/lib/data/organizer";
import { getCancellationChargePercent, getPostponementChargePercent, getDoorStaffPricing, getDoorStaffAvailable, getHeroBoostPrice, getHeroBoostDurationDays } from "@/lib/data/platform-settings";
import { getHeroBoostForEvent } from "@/lib/data/hero-boosts";
import { formatDateRange, isPast } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/constants";
import type { EventStatus } from "@/lib/types";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const { id } = await params;
  const { action } = await searchParams;

  // Handle publish action via query param
  if (action === "publish") {
    await updateEventStatus(user, id, "PUBLISHED" as EventStatus);
    redirect(`/organizer/events/${id}`);
  }

  const [event, analytics, cancelChargePct, postponeChargePct, doorStaffOrder, doorStaffPricing, doorStaffAvailable, heroBoost, heroBoostPrice, heroBoostDuration] = await Promise.all([
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
  ]);

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
          <form action={`/organizer/events/${event.id}?action=publish`} method="GET">
            <Button type="submit" size="sm">
              Publish event
            </Button>
          </form>
        ) : null}
      </div>

      {/* Analytics */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Analytics</h2>
        <AnalyticsPanel analytics={analytics} />
      </section>

      {analytics.waitlistCount > 0 ? (
        <div className="glass rounded-3xl p-5">
          <p className="text-sm text-muted">
            <span className="font-bold text-zinc-900 dark:text-white">{analytics.waitlistCount}</span>{" "}
            {analytics.waitlistCount === 1 ? "person" : "people"} on the waitlist
          </p>
        </div>
      ) : null}

      {/* Edit form — disabled for cancelled and past events */}
      {event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast ? (
        <EditEventForm event={event} />
      ) : null}

      {/* Hero Boost — disabled for cancelled and past events */}
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

      {/* Door staff — disabled for past events */}
      {eventPast ? null : doorStaffOrder ? (
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
      ) : null}

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
    </div>
  );
}
