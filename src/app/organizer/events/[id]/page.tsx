import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft, Printer } from "lucide-react";
import { lazy, Suspense } from "react";

import { AnalyticsPanel } from "@/modules/analytics";
import { AttendeesTable } from "@/modules/organizer";
import { EditEventForm, CancelPostponeButtons, CollaborationPanel, CollaboratorAccessWatcher, HeroBoostPanel, PastEventGalleryManager, WaitlistPanel, VerificationQueue, EventOverview, ManageTabs, EventEditsProvider, ManageEventHeader } from "@/modules/organizer";
import { Badge } from "@/modules/shared";
import { CollapseAllProvider, CollapsibleSection } from "@/modules/shared";

import { getCurrentUser, createServiceClient, getOrganizerProfile } from "@/modules/shared/server";
import { getEvent, getOrganizerPastEventsForLinking } from "@/modules/shared/server";
import { EventStaff } from "@/modules/scanner";
import { GuestlistPanel } from "@/modules/organizer";
import { listGuestlist } from "@/modules/shared/actions/communities";
import { listMyCommunities } from "@/modules/shared/server";
import { listEventCounterStaff } from "@/modules/scanner/server";
import { listEventStaff } from "@/modules/organizer/server";
import { getEventPromoters } from "@/modules/shared/server";
import { PromotersPanel } from "@/modules/organizer";
import { getOrganizerEventAnalytics, getEventVirality } from "@/modules/analytics/server";
import { getEventCollaboratorsForOwner, getEventAccessLevel, canViewAnalytics, canViewMoney, canScanTickets, canEditEvent, canManageOrders } from "@/modules/shared/server";
import { listEventOrders, listEventTickets } from "@/modules/shared/server";
import { expireWaitlistOffers, listEventWaitlist } from "@/modules/shared/server";

import { getCancellationChargePercent, getPostponementChargePercent, getHeroBoostPrice, getHeroBoostDurationDays } from "@/modules/shared/server";
import { getHeroBoostForEvent } from "@/modules/shared/server";
import { isEventEnded, RELEASE_FLAGS } from "@/modules/shared";
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

  // Load all page data in parallel. Only the event itself is critical — every
  // other fetch defaults to a safe fallback so one flaky query can't crash the
  // whole manage page (the old ".catch → throw" killed the page on any failure).
  const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
    p.catch((err) => { console.error("[ManageEventPage] non-critical fetch failed for", id, err); return fallback; });

  const [event, analytics, cancelChargePct, postponeChargePct, heroBoost, heroBoostPrice, heroBoostDuration, orders, tickets, waitlistEntries, collaborators, eventStaff, guestlist, eventVirality, counterStaff] = await Promise.all([
    // Critical — checked below. Retry once on transient failures: during a
    // concurrent event update (e.g. owner cancels while a collaborator's
    // realtime refresh re-renders) a single rejection would crash the page.
    getEvent(id).catch(() => getEvent(id)),
    safe(getOrganizerEventAnalytics(user, id), null),
    safe(getCancellationChargePercent(), 0),
    safe(getPostponementChargePercent(), 0),
    RELEASE_FLAGS.boost ? safe(getHeroBoostForEvent(user, id), null) : Promise.resolve(null),
    RELEASE_FLAGS.boost ? safe(getHeroBoostPrice(), 0) : Promise.resolve(0),
    RELEASE_FLAGS.boost ? safe(getHeroBoostDurationDays(), 7) : Promise.resolve(7),
    safe(listEventOrders(id), []),
    safe(listEventTickets(id), []),
    safe(listEventWaitlist(id), []),
    safe(getEventCollaboratorsForOwner(user, id), []),
    safe(listEventStaff(user, id), []),
    RELEASE_FLAGS.guestlist ? safe(listGuestlist(id), []) : Promise.resolve([]),
    safe(getEventVirality(id), null),
    safe(listEventCounterStaff(id), []),
  ]);

  // Expire stale waitlist offers (best-effort, non-blocking)
  try { await expireWaitlistOffers(); } catch { /* ignore */ }

  if (!event) notFound();

  // Check access level - owner or accepted collaborator. Note: analytics is
  // null for collaborators without ANALYTICS/FULL permission - that's not a
  // 404, they still get the event view.
  const promoters = await safe(getEventPromoters(event.organizer.id, id), []);

  const accessLevel = await getEventAccessLevel(user, id).catch(() => null);
  if (!accessLevel) notFound();
  const isOwner = accessLevel === "OWNER";
  // Collaborator realtime revocation: watchers need the viewer's organizer id
  // and their collaborator row id so a DELETE on it can be matched client-side.
  const myOrg = isOwner ? null : await safe(getOrganizerProfile(user), null);
  // collaborators can be null on a transient fetch failure — optional chain
  // so a realtime-triggered re-render doesn't TypeError into the error page.
  const myCollaboratorId = myOrg
    ? collaborators?.find((c) => c.organizerId === myOrg.id)?.id ?? null
    : null;
  const eventInviteToken =
    isOwner && event.visibility === "INVITE_ONLY"
      ? await Promise.resolve(createServiceClient().rpc("get_event_invite_token", { p_event_id: event.id, p_actor_id: user.id }).then((r) => (typeof r.data === "string" ? r.data : null))).catch(() => null)
      : null;
  const canView = canViewAnalytics(accessLevel);
  const canScan = canScanTickets(accessLevel);
  const canEdit = canEditEvent(accessLevel);
  const canOrders = canManageOrders(accessLevel);

  // Drafts get a dedicated editor (create-form prefilled) - never the live-event
  // manage UI (walk-in registration, orders, analytics don't apply to drafts).
  if (event.status === "DRAFT") {
    const [pastEventsForLinking, draftRetentionDays, savedStaff] = await Promise.all([
      safe(getOrganizerPastEventsForLinking(event.organizer.id, id), []),
      safe(getDraftRetentionDays(), 30),
      safe(
        (async () => {
          const svc = createServiceClient();
          const { data: asg } = await svc
            .from("staff_event_assignments")
            .select("staff_id, can_scan, can_sell, is_manager")
            .eq("event_id", id)
            .eq("is_active", true);
          if (!asg?.length) return [];
          const { data: members } = await svc
            .from("staff_members")
            .select("id, name, phone, email")
            .in("id", asg.map((a) => a.staff_id));
          const byId = new Map((members ?? []).map((m) => [m.id, m]));
          return asg.map((a) => ({
            name: byId.get(a.staff_id)?.name ?? "",
            phone: byId.get(a.staff_id)?.phone ?? "",
            email: byId.get(a.staff_id)?.email ?? "",
            canScan: a.can_scan,
            canSell: a.can_sell,
            isManager: a.is_manager,
          }));
        })(),
        [],
      ),
    ]);
    const initialStaff = savedStaff;
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
              initialStaff={initialStaff}
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

  const pastEventsForLinking = await safe(getOrganizerPastEventsForLinking(event.organizer.id, id), []);
  const myCommunities = await safe(listMyCommunities(user), []);

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
    <EventEditsProvider>
    <div className="space-y-6 py-6">
      {/* Realtime collaboration sync — page-level (not inside a tab) so any
          roster/permission change refreshes regardless of the active tab.
          For collaborators it also covers the page with a "removed" overlay
          when the owner revokes their access. */}
      <CollaboratorAccessWatcher
        eventId={event.id}
        myOrganizerId={myOrg?.id ?? null}
        myCollaboratorId={myCollaboratorId}
      />

      {/* Banner + title + dates + badges - merges section saves instantly */}
      <ManageEventHeader
        event={event}
        statusTone={statusTone}
        statusLabel={statusLabel}
        isOwner={isOwner}
        accessLevel={accessLevel}
      />

      {/* Analytics / Attendees / Details tabs */}
      {(() => {
        const detailsContent = (
          <CollapseAllProvider defaultOpen>
            <div className="space-y-3">
              {/* Edit form - read-only overview when locked (within 2h), cancelled, or past */}
              {canEdit && event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast && (startMs - nowMs) > 2 * 60 * 60 * 1000 ? (
                <EditEventForm event={event} pastEvents={pastEventsForLinking} communities={myCommunities} lockLogistics={!isOwner} />
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

              {RELEASE_FLAGS.boost && canEdit && event.status !== "CANCELLED" && event.status !== "CANCELLATION_REQUESTED" && !eventPast ? (
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
                        <h3 className="text-sm font-bold">Promote this event</h3>
                        <p className="mt-1 text-xs text-muted">
                          Feature it or grab a sponsored slot - campaigns live in one place now.
                        </p>
                      </div>
                      <Link
                        href={`/organizer/campaigns?event=${event.id}`}
                        className="shrink-0 rounded-full bg-neon-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90"
                      >
                        Run a campaign
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

              {RELEASE_FLAGS.guestlist && !eventPast && (event.status === "PUBLISHED" || event.status === "POSTPONED") ? (
                <CollapsibleSection title="Guestlist">
                  <GuestlistPanel eventId={event.id} guests={guestlist} />
                </CollapsibleSection>
              ) : null}

              {event.promoterMode !== "NONE" ? (
                <CollapsibleSection title="Promoters" description="People driving sales for this event - links/codes, clicks, earned commission.">
                  <PromotersPanel
                    eventId={event.id}
                    promoters={promoters}
                    program={{
                      mode: event.promoterMode ?? "NONE",
                      commissionBps: event.promoterCommissionBps ?? 1000,
                      promoBuyerBps: event.promoBuyerDiscountBps ?? 500,
                      promoPromoterBps: event.promoPromoterBps ?? 500,
                    }}
                  />
                </CollapsibleSection>
              ) : null}

              {canScan && !eventPast && (event.status === "PUBLISHED" || event.status === "POSTPONED") ? (
                <CollapsibleSection title="Staff" description="Door + box-office staff. They sign in at /scan and /box-office with the phone or email + password you set here.">
                  <EventStaff eventId={event.id} staff={counterStaff} legacyStaff={eventStaff} />
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
                    <AnalyticsPanel analytics={analytics} eventId={event.id} showMoney={canViewMoney(accessLevel)} virality={eventVirality ?? undefined} />
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
                label: `Attendees (${orders.filter((o) => o.status === "CONFIRMED").reduce((s, o) => s + (o.quantity ?? 1), 0)})`,
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
    </EventEditsProvider>
  );
}
