import Link from "next/link";
import { redirect } from "next/navigation";
import { lazy, Suspense } from "react";
import { BarChart2 } from "lucide-react";

import { AnalyticsPanel } from "@/modules/analytics";
import { AggregatedAnalytics } from "@/modules/analytics";
import { BecomeOrganizerForm } from "@/modules/organizer";
import { ClubForm } from "@/modules/shared";
import { ClubMembersPanel } from "@/modules/shared";
import { CollaborationInvites } from "@/modules/organizer";
import { KycStatusBanner } from "@/modules/organizer";
import { OrganizerEventsList } from "@/modules/organizer";
import { OrganizerHeader } from "@/modules/organizer";
import { OrganizerKycRealtimeRefresher } from "@/modules/organizer";
import { OrderMonitor } from "@/modules/organizer";
import { getCurrentUser } from "@/modules/shared/server";
import { getSettingInt } from "@/modules/shared/server";
import { createClient } from "@/modules/shared/server";
import { getPendingCollaborationInvites } from "@/modules/shared/server";
import { getOrganizerAccessState } from "@/modules/shared";
import { getOrganizerEventAnalytics, getOrganizerDailyRevenue } from "@/modules/analytics/server";
import { getOrganizerProfile } from "@/modules/shared/server";
import { listOrganizerEvents, listCollaboratedEvents } from "@/modules/organizer/server";
import { OrganizerKycReviewPanel } from "@/modules/organizer";
import { getOrganizerPastEventsForLinking } from "@/modules/shared/server";
import { listClubMembers, listMyClubs } from "@/modules/shared/server";
import { getOrganizerFollowerCount } from "@/modules/shared/server";
import { listPendingOrders, listOrdersForOrganizerEvents } from "@/modules/shared/server";
import { getTermsVersion, getDoorStaffPricing, getDoorStaffMax, getDoorStaffAvailable, getDraftRetentionDays } from "@/modules/shared/server";

// Lazy load EventForm — it pulls in Leaflet (~140kB) via MapPicker
const EventForm = lazy(() =>
  import("@/modules/organizer").then((m) => ({ default: m.EventForm })),
);

export const dynamic = "force-dynamic";

export const metadata = { title: "Organizer — Outsiderr" };

type Tab = "events" | "create" | "verify" | "analytics" | "clubs";

const TABS: { value: Tab; label: string }[] = [
  { value: "events", label: "My Events" },
  { value: "create", label: "Create Event" },
  { value: "verify", label: "Verification" },
  { value: "analytics", label: "Analytics" },
  // Clubs & Crews disabled for this release — kept in admin only
  // { value: "clubs", label: "Clubs & Crews" },
];

export default async function OrganizerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  // Check if the user has an organizer profile.
  // The profile must exist in the organizers table.
  const organizerProfile = await getOrganizerProfile(user);
  if (!organizerProfile) {
    return (
      <div className="py-10">
        <BecomeOrganizerForm />
      </div>
    );
  }

  const rejectionLimit = await getSettingInt("organizer_rejection_limit");
  const accessState = getOrganizerAccessState({
    kycStatus: organizerProfile.kycStatus,
    rejectionCount: organizerProfile.rejectionCount,
    rejectionLimit,
  });

  const kycInProgress = organizerProfile.kycStatus === "PENDING" || organizerProfile.kycStatus === "CLARIFICATION_NEEDED";
  if (kycInProgress || organizerProfile.kycStatus === "REJECTED") {
    if (accessState.blocked) {
      return (
        <div className="flex min-h-[55vh] items-center py-10">
          <div className="glass mx-auto max-w-lg rounded-3xl border border-red-300 bg-red-500/5 p-8 text-center">
            <h1 className="text-2xl font-black tracking-tight">Organizer application rejected</h1>
            <p className="mt-3 text-sm text-muted">
              Your organizer application was rejected {organizerProfile.rejectionCount ?? 0} time{(organizerProfile.rejectionCount ?? 0) === 1 ? "" : "s"} — the maximum allowed
              ({rejectionLimit}) — so this account can&apos;t apply again.
            </p>
            <p className="mt-2 text-sm text-muted">
              If you think this is a mistake, please contact Outsiderr support and we&apos;ll take another look.
            </p>
            <Link
              href="/contact"
              className="mt-5 inline-block rounded-2xl border border-red-300 px-8 py-3 text-sm font-bold text-red-500 transition-colors hover:bg-red-500/10"
            >
              Contact support
            </Link>
          </div>
        </div>
      );
    }

    // Rejected but under the limit → straight back into the 5-step KYC
    // wizard (a fresh application overwrites the previous row).
    if (organizerProfile.kycStatus === "REJECTED") {
      return (
        <div className="py-10">
          <BecomeOrganizerForm />
        </div>
      );
    }

    // KYC thread — organizer sees the full admin↔organizer conversation
    const supabase = await createClient();
    const { data: threadRows } = await supabase
      .from("kyc_messages")
      .select("sender_role, sender_email, message, created_at")
      .eq("organizer_id", organizerProfile.id)
      .order("created_at", { ascending: true });
    const thread = (threadRows ?? []).map((m) => ({
      senderRole: m.sender_role,
      senderEmail: m.sender_email,
      message: m.message,
      createdAt: m.created_at,
    }));

    return (
      <div className="min-h-[55vh] space-y-6 py-6">
        <OrganizerKycRealtimeRefresher userId={user.id} />
        <OrganizerKycReviewPanel organizer={organizerProfile} thread={thread} />
      </div>
    );
  }

  const rawTab = (await searchParams).tab as Tab | undefined;
  const tab: Tab = TABS.some((t) => t.value === rawTab) ? (rawTab as Tab) : "events";

  const [events, pending, termsVersion, doorStaffPricing, doorStaffMax, doorStaffAvailable, pastEventsForLinking, collabInvites, collabEvents, draftRetentionDays] = await Promise.all([
    listOrganizerEvents(user),
    listPendingOrders(),
    getTermsVersion(),
    getDoorStaffPricing(),
    getDoorStaffMax(),
    getDoorStaffAvailable(),
    getOrganizerPastEventsForLinking(organizerProfile.id),
    getPendingCollaborationInvites(user),
    listCollaboratedEvents(user),
    getDraftRetentionDays(),
  ]);

  // Merge owned events + collaborated events (dedup by id, owned takes precedence)
  const ownedIds = new Set(events.map((e) => e.id));
  const collaboratedEvents = collabEvents.filter((e) => !ownedIds.has(e.id));
  const allEvents = [...events, ...collaboratedEvents];

  // Fetch all orders for the organizer's events (for the Order Monitor)
  const organizerEventIds = allEvents.map((e) => e.id);
  const [allOrders, followerCount] = await Promise.all([
    organizerEventIds.length > 0
      ? listOrdersForOrganizerEvents(organizerEventIds)
      : Promise.resolve([]),
    getOrganizerFollowerCount(organizerProfile.id),
  ]);

  // Analytics tab: fetch per-event analytics
  // Also fetch for events tab so sorting by waitlist/revenue works
  let analyticsData: Awaited<ReturnType<typeof getOrganizerEventAnalytics>>[] = [];
  let dailyRevenue: Awaited<ReturnType<typeof getOrganizerDailyRevenue>> = [];
  if (tab === "analytics" || tab === "events") {
    [analyticsData, dailyRevenue] = await Promise.all([
      Promise.all(allEvents.map((event) => getOrganizerEventAnalytics(user, event.id))),
      tab === "analytics" ? getOrganizerDailyRevenue(user) : Promise.resolve([]),
    ]);
  }
  const analyticsMap: Record<string, NonNullable<(typeof analyticsData)[number]>> = {};
  for (const a of analyticsData) {
    if (a) analyticsMap[a.eventId] = a;
  }

  // Clubs tab: fetch organizer's clubs + members
  let myClubs: Awaited<ReturnType<typeof listMyClubs>> = [];
  let clubMembersMap: Record<string, Awaited<ReturnType<typeof listClubMembers>>> = {};
  if (tab === "clubs") {
    myClubs = await listMyClubs(user);
    const membersArrays = await Promise.all(myClubs.map((c) => listClubMembers(c.id)));
    clubMembersMap = Object.fromEntries(myClubs.map((c, i) => [c.id, membersArrays[i]]));
  }

  return (
    <div className="space-y-6 py-6">
      <OrganizerKycRealtimeRefresher userId={user.id} />

      {/* Profile header with avatar, name, edit button, and action buttons */}
      <OrganizerHeader organizer={organizerProfile} followerCount={followerCount} />

      {/* KYC status banner — shown if pending/rejected/clarification or has staged changes */}
      <KycStatusBanner
        kycStatus={organizerProfile.kycStatus ?? "NOT_SUBMITTED"}
        hasPendingChanges={Object.keys(organizerProfile.pendingKyc ?? {}).length > 0}
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <TabLink
            key={t.value}
            href={`/organizer?tab=${t.value}`}
            label={
              t.value === "verify" && pending.length
                ? `${t.label} (${pending.length})`
                : t.label
            }
            active={tab === t.value}
          />
        ))}
      </div>

      {/* Collaboration invites — shown at top of dashboard if any pending */}
      {collabInvites.length > 0 ? <CollaborationInvites invites={collabInvites} /> : null}

      {tab === "events" ? (
        <OrganizerEventsList events={allEvents} analyticsMap={analyticsMap} />
      ) : tab === "create" ? (
        <Suspense
          fallback={
            <div className="glass flex h-96 items-center justify-center rounded-3xl">
              <p className="text-sm text-muted">Loading event form…</p>
            </div>
          }
        >
          <EventForm
            organizerName={organizerProfile.name}
            termsVersion={termsVersion}
            doorStaffPricing={doorStaffPricing}
            doorStaffMax={Math.min(doorStaffMax, doorStaffAvailable)}
            pastEvents={pastEventsForLinking}
            draftRetentionDays={draftRetentionDays}
          />
        </Suspense>
      ) : tab === "verify" ? (
        <OrderMonitor orders={allOrders} organizerEventIds={organizerEventIds} />
      ) : tab === "analytics" ? (
        <div className="space-y-6">
          {/* Aggregated analytics across all events (exclude drafts) */}
          {(() => {
            const nonDraftEvents = allEvents.filter((e) => e.status !== "DRAFT");
            const nonDraftAnalytics = nonDraftEvents.map((e) => analyticsMap[e.id]).filter((a): a is NonNullable<typeof a> => !!a);
            return (
              <>
                <div>
                  <h2 className="mb-3 text-lg font-bold">Overview — All Events</h2>
                  <AggregatedAnalytics events={nonDraftEvents} analyticsData={nonDraftAnalytics} dailyRevenue={dailyRevenue} />
                </div>

                {/* Per-event breakdown */}
                {nonDraftEvents.length > 0 ? (
                  <div>
                    <h2 className="mb-3 text-lg font-bold">Per-Event Breakdown</h2>
                    <div className="space-y-6">
                      {nonDraftEvents.map((event) => {
                        const analytics = analyticsMap[event.id];
                        if (!analytics) return null;
                        return (
                          <div key={event.id} className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Link
                                href={`/organizer/events/${event.id}`}
                                className="text-base font-bold hover:text-violet-neon"
                              >
                                {event.title}
                              </Link>
                              <Link
                                href={`/organizer/events/${event.id}/report`}
                                className="flex items-center gap-1.5 text-xs text-muted hover:text-violet-neon"
                              >
                                <BarChart2 className="h-3.5 w-3.5" />
                                Print report
                              </Link>
                            </div>
                            <AnalyticsPanel
                              analytics={analytics}
                              capacity={event.totalCapacity}
                              ticketsSold={event.ticketsSold}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : tab === "clubs" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Create club form */}
          <ClubForm />

          {/* My clubs + member management */}
          <div className="space-y-6">
            {myClubs.length === 0 ? (
              <p className="glass rounded-3xl p-5 text-sm text-muted">
                No clubs yet. Create one to start building your community.
              </p>
            ) : (
              myClubs.map((club) => (
                <div key={club.id} className="glass rounded-3xl p-5">
                  <ClubMembersPanel
                    club={club}
                    members={clubMembersMap[club.id] ?? []}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TabLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-neon-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow-violet"
          : "rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-muted hover:border-violet-neon dark:border-white/10"
      }
    >
      {label}
    </Link>
  );
}
