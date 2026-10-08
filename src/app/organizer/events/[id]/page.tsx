import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { BarChart2, ChevronLeft, LayoutDashboard, ScanLine } from "lucide-react";
import { lazy, Suspense } from "react";

import { AnalyticsPanel } from "@/modules/analytics";
import { AttendeesTable } from "@/modules/organizer";
import { EditEventForm, CancelPostponeButtons, CollaborationPanel, EventStaffManager, ScannerPinManager, BoxOfficePinManager, HeroBoostPanel, PastEventGalleryManager, WaitlistPanel, VerificationQueue } from "@/modules/organizer";
import { ShareButton } from "@/modules/web";
import { WalkinCheckinForm } from "@/modules/scanner";
import { Badge } from "@/modules/shared";
import { Button } from "@/modules/shared";
import { CollapsibleSection } from "@/modules/shared";

import { getCurrentUser } from "@/modules/shared/server";
import { getEvent, getOrganizerPastEventsForLinking } from "@/modules/shared/server";
import { listEventStaff } from "@/modules/organizer/server";
import { listEventScannerPins } from "@/modules/shared/server";
import { listBoxOfficePinsForEvent } from "@/modules/shared/server";
import { getOrganizerEventAnalytics } from "@/modules/analytics/server";
import { getEventCollaboratorsForOwner, getEventAccessLevel, canViewAnalytics, canViewMoney, canScanTickets, canEditEvent, canManageOrders } from "@/modules/shared/server";
import { listEventOrders, listEventTickets } from "@/modules/shared/server";
import { expireWaitlistOffers, listEventWaitlist } from "@/modules/shared/server";

import { getCancellationChargePercent, getPostponementChargePercent, getDoorStaffPricing, getDoorStaffAvailable, getHeroBoostPrice, getHeroBoostDurationDays, getDoorStaffOrder } from "@/modules/shared/server";
import { getHeroBoostForEvent } from "@/modules/shared/server";
import { formatDateRange, isEventEnded } from "@/modules/shared";
import { CATEGORY_LABELS } from "@/modules/shared";
import { getDraftRetentionDays } from "@/modules/shared/server";

// Lazy - EventForm pulls in Leaflet via MapPicker
const EventForm = lazy(() =>
  import("@/modules/organizer").then((m) => ({ default: m.EventForm })),
);

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const event = await getEvent((await params).id);
  return { title: event ? `Manage: ${event.title} - Outsiderr` : "Manage Event - Outsiderr" };
}

export default async function ManageEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const { id } = await params;

  // Load all page data in parallel. Log the real error server-side before letting
  // the route-level error.tsx handle the fallback UI for the user.
  const [event, analytics, cancelChargePct, postponeChargePct, doorStaffOrder, doorStaffPricing, doorStaffAvailable, heroBoost, heroBoostPrice, heroBoostDuration, orders, tickets, waitlistEntries, eventStaff, scannerPins, boxOfficePins, collaborators] = await Promise.all([
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
    listEventStaff(user, id),
    listEventScannerPins(user, id),
    listBoxOfficePinsForEvent(user, id),
    getEventCollaboratorsForOwner(user, id),
  ]).catch((err: unknown) => {
    console.error("[ManageEventPage] Data load error for event", id, err);
    throw err; // Re-throw so the route error boundary (error.tsx) handles it
  });

  // Expire stale waitlist offers (best-effort, non-blocking)
  try { await expireWaitlistOffers(); } catch { /* ignore */ }

  if (!event) notFound();

  // Check access level - owner or accepted collaborator. Note: analytics is
  // null for collaborators without ANALYTICS/FULL permission - that's not a
  // 404, they still get the event view.
  const accessLevel = await getEventAccessLevel(user, id);
  if (!accessLevel) notFound();
  const isOwner = accessLevel === "OWNER";
  const canView = canViewAnalytics(accessLevel);
  const canScan = canScanTickets(accessLevel);
  const canEdit = canEditEvent(accessLevel);
  const canOrders = canManageOrders(accessLevel);

  // Drafts get a dedicated editor (create-form prefilled) - never the live-event
  // manage UI (walk-in registration, orders, analytics don't apply to drafts).
  if (event.status === "DRAFT") {
    const [pastEventsForLinking, draftRetentionDays] = await Promise.all([
      getOrganizerPastEventsForLinking(event.organizer.id, id),
      getDraftRetentionDays(),
    ]);
    return (
      <div className="space-y-6 py-6">
        <div className="flex items-center gap-3">
          <Link href="/organizer" className="text-muted hover:text-violet-neon">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-black tracking-tight">{event.title}</h1>
            <p className="text-sm text-muted">Draft - finish setup or keep editing</p>
          </div>
          <Badge tone="warning" className="bg-black/60 text-amber-300">Draft</Badge>
        </div>
        {canEdit ? (
          <Suspense
            fallback={
              <div className="glass flex h-96 items-center justify-center rounded-3xl">
                <p className="text-sm text-muted">Loading editor…</p>
              </div>
            }
          >
            <EventForm
              draftEvent={event}
              draftRetentionDays={draftRetentionDays}
              organizerName={event.organizer.name}
              pastEvents={pastEventsForLinking}
            />
          </Suspense>
        ) : (
          <div className="glass rounded-3xl p-5 text-sm text-muted">
            This event is still a draft. Only the organizer (or a co-organizer with edit
            access) can edit and publish it.
          </div>
        )}
      </div>
    );
  }

  const pastEventsForLinking = await getOrganizerPastEventsForLinking(event.organizer.id, id);

  const eventPast = isEventEnded(event.startsAt, event.endsAt);

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

  // Check if event is happening now (between startsAt and endsAt)
  const nowMs = Date.now();
  const startMs = new Date(event.startsAt).getTime();
  const endMs = event.endsAt ? new Date(event.endsAt).getTime() : startMs + 2 * 60 * 60 * 1000;
  const isHappeningNow = !eventPast && nowMs >= startMs && nowMs <= endMs;

  const statusLabel =
    eventPast
      ? "Completed"
      : event.status === "PUBLISHED"
      ? (isHappeningNow ? "Live" : "Published")
      : event.status === "CANCELLED"
      ? "Cancelled"
      : event.status === "CANCELLATION_REQUESTED"
      ? "Cancelling…"
      : event.status === "POSTPONED"
      ? "Postponed"
      : "Draft";

  return (
    <div className="space-y-6 py-6">
      {/* Event banner image */}
      {(event.bannerPosterUrl || event.cardPosterUrl) ? (
        <div className="relative -mx-4 h-[30vh] max-h-[260px] min-h-[160px] overflow-hidden sm:rounded-b-3xl">
          <Image
            src={event.bannerPosterUrl ?? event.cardPosterUrl!}
            alt={event.title}
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-50 via-zinc-50/20 to-transparent dark:from-ink dark:via-ink/30" />
        </div>
      ) : null}

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
        <Badge tone="violet">{CATEGORY_LABELS[event.category as keyof typeof CATEGORY_LABELS] || event.category}</Badge>
        <Badge tone={statusTone}>{statusLabel}</Badge>
        {event.isFeatured ? <Badge tone="lime">Boosted</Badge> : null}
        {!isOwner ? <Badge tone="violet">Co-organizer · {accessLevel}</Badge> : null}
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
        {eventPast ? null : canScan ? (
          <Link href={`/organizer/events/${event.id}/scan`}>
            <Button size="sm">
              <ScanLine className="h-4 w-4" />
              Door Scanner
            </Button>
          </Link>
        ) : null}
        {eventPast ? null : canScan ? (
          <Link href="/scan">
            <Button variant="secondary" size="sm">
              <ScanLine className="h-4 w-4" />
              Staff Scanner
            </Button>
          </Link>
        ) : null}
      </div>

      {/* Analytics - LIMITED sees it without money figures */}

      <nav aria-label="Event management sections" className="sticky top-16 z-20 -mx-4 flex gap-2 overflow-x-auto border-y border-zinc-200 bg-zinc-50/95 px-4 py-2 backdrop-blur-sm dark:border-white/10 dark:bg-ink/95">
        {[
          ["manage-analytics", "Overview"],
          ["manage-attendees", "Attendees"],
          ["manage-edit", "Event details"],
          ["manage-promotion", "Promotion"],
          ["manage-collaboration", "Collaborators"],
          ["manage-operations", "Operations"],
          ["manage-lifecycle", "Event actions"],
        ].map(([sectionId, label]) => (
          <a
            key={sectionId}
            href={`#${sectionId}`}
            className="shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
          >
            {label}
          </a>
        ))}
      </nav>
      {canView && analytics ? (
        <section id="manage-analytics" className="scroll-mt-36 space-y-3">
          <h2 className="text-lg font-bold">Analytics</h2>
          <AnalyticsPanel analytics={analytics} eventId={event.id} showMoney={canViewMoney(accessLevel)} />
        </section>
      ) : null}

      {canView && analytics && analytics.waitlistCount > 0 ? (
        <WaitlistPanel waitlistCount={analytics.waitlistCount} entries={waitlistEntries} />
      ) : null}

      {/* Payment verification queue - for paid events with manual UPI flow */}
      {canOrders && orders.some((o) => o.status === "PENDING_VERIFICATION") ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Payment Verification</h2>
          <VerificationQueue
            orders={orders.filter((o: { status: string }) => o.status === "PENDING_VERIFICATION")}
            organizerEventIds={[event.id]}
          />
        </section>
      ) : null}

      {/* Walk-in / manual check-in - available before and during the event */}
      {event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast && canScan ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">
            {isHappeningNow ? "Walk-in Check-in" : "Manual Walk-in Registration"}
          </h2>
          <WalkinCheckinForm event={event} isHappeningNow={isHappeningNow} />
        </section>
      ) : null}

      {/* Attendees / Orders list */}
      {canOrders ? (
      <section id="manage-attendees" className="scroll-mt-36 space-y-3">
        <h2 className="text-lg font-bold">Attendees ({orders.length})</h2>
        {orders.length === 0 ? (
          <div className="glass rounded-2xl p-5 text-sm text-muted">
            No bookings yet.
          </div>
        ) : (
          <AttendeesTable orders={orders} tickets={tickets} />
        )}
      </section>
      ) : null}

      {/* Edit form - disabled for cancelled, past, and events starting within 2 hours */}
      {canEdit && event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast && (startMs - nowMs) > 2 * 60 * 60 * 1000 ? (
        <div id="manage-edit" className="scroll-mt-36">
          <EditEventForm event={event} pastEvents={pastEventsForLinking} lockLogistics={!isOwner} />
        </div>
      ) : canEdit && event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast && (startMs - nowMs) <= 2 * 60 * 60 * 1000 ? (
        <div className="glass rounded-3xl p-5">
          <h2 className="mb-2 text-base font-bold">Edit Event</h2>
          <p className="text-sm text-muted">
            Editing is locked within 2 hours of the event start time. If you need to make changes, please contact Outsiderr support.
          </p>
        </div>
      ) : null}

      {/* Featured & boost - collapsed by default */}
      {canEdit && event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast ? (
        <div id="manage-promotion" className="scroll-mt-36">
          <CollapsibleSection title="Featured & Boost" description="Hero rotation and homepage slot boosts.">
            <div className="space-y-4">
              <HeroBoostPanel
                eventId={event.id}
                boost={heroBoost}
                pricePaise={heroBoostPrice}
                durationDays={heroBoostDuration}
                eventStartsAt={event.startsAt}
                platformUpiId={process.env.NEXT_PUBLIC_PLATFORM_UPI_ID ?? "outsiderr@upi"}
              />
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                <div>
                  <h3 className="text-sm font-bold">Slot Boost</h3>
                  <p className="mt-1 text-xs text-muted">
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
            </div>
          </CollapsibleSection>
        </div>
      ) : null}

      {/* Door staff - disabled for this release (kept in admin only) */}
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

      {/* Collaboration - everyone on the event sees the roster; only the owner invites/removes */}
      {!eventPast && collaborators !== null ? (
        <div id="manage-collaboration" className="scroll-mt-36">
          <CollapsibleSection title="Collaborators" description="Co-organizers, permissions and invites.">
            <CollaborationPanel eventId={event.id} collaborators={collaborators} canManage={isOwner} />
          </CollapsibleSection>
        </div>
      ) : null}

      {/* Operations - door staff, scanner + box-office PINs */}
      {canScan && !eventPast && (event.status === "PUBLISHED" || event.status === "POSTPONED") ? (
        <div id="manage-operations" className="scroll-mt-36 space-y-3">
          <CollapsibleSection title="Door Staff & Scanner" description="Staff roster and gate scanner access PINs.">
            <div className="space-y-4">
              <EventStaffManager eventId={event.id} staff={eventStaff} />
              <ScannerPinManager eventId={event.id} pins={scannerPins} />
            </div>
          </CollapsibleSection>
          <CollapsibleSection title="Box Office PINs" description="PINs for on-ground box-office sales.">
            <BoxOfficePinManager eventId={event.id} pins={boxOfficePins} />
          </CollapsibleSection>
        </div>
      ) : null}

      {/* Cancel / Postpone - owner only, never a collaborator */}
      {isOwner && !eventPast && (event.status === "PUBLISHED" || event.status === "POSTPONED") ? (
        <div id="manage-lifecycle" className="scroll-mt-36">
          <CollapsibleSection title="Postpone / Cancel" description="Owner only. Ticket holders are notified automatically.">
            <div className="rounded-2xl border border-red-500/30 p-4">
              <CancelPostponeButtons
                event={event}
                cancellationChargePercent={cancelChargePct}
                postponementChargePercent={postponeChargePct}
              />
            </div>
          </CollapsibleSection>
        </div>
      ) : null}

      {/* Past events - allow gallery photo deletion only */}
      {eventPast && canEdit ? (
        <PastEventGalleryManager eventId={event.id} photoUrls={event.photoUrls} />
      ) : null}
    </div>
  );
}
