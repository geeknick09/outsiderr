import Link from "next/link";
import { redirect } from "next/navigation";
import { lazy, Suspense } from "react";
import { BarChart2 } from "lucide-react";

import { AnalyticsPanel } from "@/components/organizer/analytics-panel";
import { AggregatedAnalytics } from "@/components/organizer/aggregated-analytics";
import { BecomeOrganizerForm } from "@/components/organizer/become-organizer-form";
import { ClubForm } from "@/components/organizer/club-form";
import { ClubMembersPanel } from "@/components/organizer/club-members-panel";
import { OrganizerEventsList } from "@/components/organizer/organizer-events-list";
import { OrganizerHeader } from "@/components/organizer/organizer-header";
import { VerificationQueue } from "@/components/organizer/verification-queue";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrganizerEventAnalytics,
  getOrganizerProfile,
  listOrganizerEvents,
} from "@/lib/data/organizer";
import { listClubMembers, listMyClubs } from "@/lib/data/clubs";
import { listPendingOrders } from "@/lib/data/orders";
import { getTermsVersion, getDoorStaffPricing, getDoorStaffMax, getDoorStaffAvailable } from "@/lib/data/platform-settings";

// Lazy load EventForm — it pulls in Leaflet (~140kB) via MapPicker
const EventForm = lazy(() =>
  import("@/components/organizer/event-form").then((m) => ({ default: m.EventForm })),
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

  const rawTab = (await searchParams).tab as Tab | undefined;
  const tab: Tab = TABS.some((t) => t.value === rawTab) ? (rawTab as Tab) : "events";

  const [events, pending, termsVersion, doorStaffPricing, doorStaffMax, doorStaffAvailable] = await Promise.all([
    listOrganizerEvents(user),
    listPendingOrders(),
    getTermsVersion(),
    getDoorStaffPricing(),
    getDoorStaffMax(),
    getDoorStaffAvailable(),
  ]);

  // Analytics tab: fetch per-event analytics
  // Also fetch for events tab so sorting by waitlist/revenue works
  let analyticsData: Awaited<ReturnType<typeof getOrganizerEventAnalytics>>[] = [];
  if (tab === "analytics" || tab === "events") {
    analyticsData = await Promise.all(
      events.map((event) => getOrganizerEventAnalytics(user, event.id)),
    );
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
      {/* Profile header with avatar, name, edit button, and action buttons */}
      <OrganizerHeader organizer={organizerProfile} />

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

      {tab === "events" ? (
        <OrganizerEventsList events={events} analyticsMap={analyticsMap} />
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
          />
        </Suspense>
      ) : tab === "verify" ? (
        <VerificationQueue orders={pending} organizerEventIds={events.map((e) => e.id)} />
      ) : tab === "analytics" ? (
        <div className="space-y-6">
          {/* Aggregated analytics across all events (exclude drafts) */}
          {(() => {
            const nonDraftEvents = events.filter((e) => e.status !== "DRAFT");
            const nonDraftAnalytics = nonDraftEvents.map((e) => analyticsMap[e.id]).filter((a): a is NonNullable<typeof a> => !!a);
            return (
              <>
                <div>
                  <h2 className="mb-3 text-lg font-bold">Overview — All Events</h2>
                  <AggregatedAnalytics events={nonDraftEvents} analyticsData={nonDraftAnalytics} />
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
