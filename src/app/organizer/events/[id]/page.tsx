import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft, LayoutDashboard, Printer } from "lucide-react";
import { lazy, Suspense } from "react";

import { AnalyticsPanel } from "@/modules/analytics";
import { AttendeesTable } from "@/modules/organizer";
import { EditEventForm, CancelPostponeButtons, CollaborationPanel, HeroBoostPanel, PastEventGalleryManager, WaitlistPanel, VerificationQueue, EventOverview, ManageTabs } from "@/modules/organizer";
import { ShareButton } from "@/modules/web";
import { Badge } from "@/modules/shared";
import { Button } from "@/modules/shared";
import { CollapseAllProvider, CollapsibleSection } from "@/modules/shared";

import { getCurrentUser, createServiceClient } from "@/modules/shared/server";
import { getEvent, getOrganizerPastEventsForLinking } from "@/modules/shared/server";
import { EventStaff } from "@/modules/scanner";
import { GuestlistPanel } from "@/modules/organizer";
import { listGuestlist } from "@/modules/shared/actions/communities";
import { listEventCounterStaff } from "@/modules/scanner/server";
import { getEventPromoters } from "@/modules/shared/server";
import { PromotersPanel } from "@/modules/organizer";
import { getOrganizerEventAnalytics } from "@/modules/analytics/server";
import { getEventCollaboratorsForOwner, getEventAccessLevel, canViewAnalytics, canViewMoney, canScanTickets, canEditEvent, canManageOrders } from "@/modules/shared/server";
import { listEventOrders, listEventTickets } from "@/modules/shared/server";
import { expireWaitlistOffers, listEventWaitlist } from "@/modules/shared/server";

import { getCancellationChargePercent, getPostponementChargePercent, getHeroBoostPrice, getHeroBoostDurationDays } from "@/modules/shared/server";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const { id } = await params;

  // Load all page data in parallel. Log the real error server-side before letting
  // the route-level error.tsx handle the fallback UI for the user.
  const [event, analytics, cancelChargePct, postponeChargePct, heroBoost, heroBoostPrice, heroBoostDuration, orders, tickets, waitlistEntries, collaborators, eventStaff, guestlist] = await Promise.all([
    getEvent(id),
    getOrganizerEventAnalytics(user, id),
    getCancellationChargePercent(),
    getPostponementChargePercent(),
    getHeroBoostForEvent(user, id),
    getHeroBoostPrice(),
    getHeroBoostDurationDays(),
    listEventOrders(id),
    listEventTickets(id),
    listEventWaitlist(id),
    getEventCollaboratorsForOwner(user, id),
    listEventCounterStaff(id),
    listGuestlist(id),
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
  const promoters = event ? await getEventPromoters(event.organizer.id, id) : [];

  const accessLevel = await getEventAccessLevel(user, id);
  if (!accessLevel) notFound();
  const isOwner = accessLevel === "OWNER";
  const eventInviteToken =
    isOwner && event.visibility === "INVITE_ONLY"
      ? await createServiceClient().rpc("get_event_invite_token", { p_event_id: event.id, p_actor_id: user.id }).then((r) => (typeof r.data === "string" ? r.data : null))
      : null;
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
        <div className="relative -mx-4 aspect-[3/4] max-h-[70vh] w-[calc(100%+2rem)] overflow-hidden sm:aspect-video sm:max-h-[440px] sm:w-full sm:rounded-b-3xl">
          <Image
            src={event.bannerPosterUrl ?? event.cardPosterUrl!}
            alt={event.title}
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />
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

      {/* Actions - scanner/walkin live in the scanner + box-office surfaces */}
      <div className="flex flex-wrap gap-3">
        <Link href={`/events/${event.id}`} target="_blank">
          <Button variant="secondary" size="sm">View event page ↗</Button>
        </Link>
        <ShareButton
          url={`/events/${event.id}`}
          title={event.title}
          variant="secondary"
          size="sm"
        />
      </div>

      {/* Analytics / Attendees / Details tabs */}
      {(() => {
        const detailsContent = (
          <CollapseAllProvider defaultOpen>
            <div className="space-y-3">
              {/* Edit form - read-only overview when locked (within 2h), cancelled, or past */}
              {canEdit && event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast && (startMs - nowMs) > 2 * 60 * 60 * 1000 ? (
                <EditEventForm event={event} pastEvents={pastEventsForLinking} lockLogistics={!isOwner} />
              ) : (
                <div className="space-y-3">
                  {canEdit && !eventPast && event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" ? (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Editing is locked within 2 hours of the event start time. If you need to make changes, please contact Outsiderr support.
                    </div>
                  ) : null}
                  <EventOverview event={event} />
                </div>
              )}

              {canEdit && event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast ? (
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
              ) : null}

              {eventInviteToken ? (
                <div className="glass rounded-3xl border border-violet-neon/40 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-violet-neon">Invite-only event</p>
                  <p className="mt-1 break-all text-sm">
                    Share link: <span className="font-mono text-xs">{`/events/${event.id}?invite=${eventInviteToken}`}</span>
                  </p>
                </div>
              ) : null}

              {!eventPast && collaborators !== null ? (
                <CollapsibleSection title="Collaborators" description="Co-organizers, permissions and invites.">
                  <CollaborationPanel eventId={event.id} collaborators={collaborators} canManage={isOwner} />
                </CollapsibleSection>
              ) : null}

              {!eventPast && (event.status === "PUBLISHED" || event.status === "POSTPONED") ? (
                <CollapsibleSection title="Guestlist">
                  <GuestlistPanel eventId={event.id} guests={guestlist} />
                </CollapsibleSection>
              ) : null}

              {event.promoterMode !== "NONE" ? (
                <CollapsibleSection title="Promoters" description="People driving sales for this event - links/codes, clicks, earned commission.">
                  <PromotersPanel eventId={event.id} promoters={promoters} />
                </CollapsibleSection>
              ) : null}

              {canScan && !eventPast && (event.status === "PUBLISHED" || event.status === "POSTPONED") ? (
                <CollapsibleSection title="Staff" description="Door + box-office staff. They sign in at /scan and /box-office with the phone or email + password you set here.">
                  <EventStaff eventId={event.id} staff={eventStaff} />
                </CollapsibleSection>
              ) : null}

              {isOwner && !eventPast && (event.status === "PUBLISHED" || event.status === "POSTPONED") ? (
                <CollapsibleSection title="Postpone / Cancel" description="Owner only. Ticket holders are notified automatically.">
                  <div className="rounded-2xl border border-red-500/30 p-4">
                    <CancelPostponeButtons
                      event={event}
                      cancellationChargePercent={cancelChargePct}
                      postponementChargePercent={postponeChargePct}
                    />
                  </div>
                </CollapsibleSection>
              ) : null}

              {eventPast && canEdit ? (
                <PastEventGalleryManager eventId={event.id} photoUrls={event.photoUrls} />
              ) : null}
            </div>
          </CollapseAllProvider>
        );

        const tabs = [
          { id: "details", label: "Details", content: detailsContent },
          ...(canView && analytics
            ? [{
                id: "analytics",
                label: "Analytics",
                content: (
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <Link
                        href={`/organizer/events/${event.id}/report`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
                      >
                        <Printer className="h-3.5 w-3.5" /> Print report
                      </Link>
                    </div>
                    <AnalyticsPanel analytics={analytics} eventId={event.id} showMoney={canViewMoney(accessLevel)} />
                    {analytics.waitlistCount > 0 ? (
                      <WaitlistPanel waitlistCount={analytics.waitlistCount} entries={waitlistEntries} />
                    ) : null}
                    {canOrders && orders.some((o) => o.status === "PENDING_VERIFICATION") ? (
                      <VerificationQueue
                        orders={orders.filter((o: { status: string }) => o.status === "PENDING_VERIFICATION")}
                        organizerEventIds={[event.id]}
                      />
                    ) : null}
                  </div>
                ),
              }]
            : []),
          ...(canOrders
            ? [{
                id: "attendees",
                label: `Attendees (${orders.length})`,
                content: (
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <Link
                        href={`/organizer/events/${event.id}/report`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
                      >
                        <Printer className="h-3.5 w-3.5" /> Print attendee list
                      </Link>
                    </div>
                    {orders.length === 0 ? (
                      <div className="glass rounded-2xl p-5 text-sm text-muted">
                        No bookings yet.
                      </div>
                    ) : (
                      <AttendeesTable orders={orders} tickets={tickets} />
                    )}
                  </div>
                ),
              }]
            : []),
        ];
        return (
          <ManageTabs
            tabs={tabs}
            defaultTab={tab === "analytics" || tab === "attendees" || tab === "details" ? tab : "details"}
          />
        );
      })()}
    </div>
  );
}
