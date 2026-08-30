import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart2, Rocket, ScanLine } from "lucide-react";

import { AnalyticsPanel } from "@/components/organizer/analytics-panel";
import { BecomeOrganizerForm } from "@/components/organizer/become-organizer-form";
import { EventForm } from "@/components/organizer/event-form";
import { VerificationQueue } from "@/components/organizer/verification-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrganizerEventAnalytics,
  getOrganizerProfile,
  listOrganizerEvents,
} from "@/lib/data/organizer";
import { listPendingOrders } from "@/lib/data/orders";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Organizer — Outsiderr" };

type Tab = "events" | "create" | "verify" | "analytics";

const TABS: { value: Tab; label: string }[] = [
  { value: "events", label: "My Events" },
  { value: "create", label: "Create Event" },
  { value: "verify", label: "Verification" },
  { value: "analytics", label: "Analytics" },
];

export default async function OrganizerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  // Check if the user has an organizer profile.
  // Demo mode: the profile is granted after submitting the become-organizer form.
  // Supabase mode: the profile must exist in the organizers table.
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

  const [events, pending] = await Promise.all([
    listOrganizerEvents(user),
    listPendingOrders(),
  ]);

  // Analytics tab: fetch per-event analytics
  let analyticsData: Awaited<ReturnType<typeof getOrganizerEventAnalytics>>[] = [];
  if (tab === "analytics") {
    analyticsData = await Promise.all(
      events.map((event) => getOrganizerEventAnalytics(user, event.id)),
    );
  }

  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Organizer</h1>
          <p className="text-sm text-muted">Publish events and manage your community.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/organizer/boost">
            <Button variant="secondary">
              <Rocket className="h-4 w-4" />
              Boost event
            </Button>
          </Link>
          <Link href="/organizer/scan">
            <Button variant="secondary">
              <ScanLine className="h-4 w-4" />
              Door scanner
            </Button>
          </Link>
        </div>
      </div>

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
        <div className="space-y-3">
          {events.length === 0 ? (
            <p className="glass rounded-3xl p-5 text-sm text-muted">
              No events yet.{" "}
              <Link href="/organizer?tab=create" className="underline hover:text-violet-neon">
                Create your first event
              </Link>
              .
            </p>
          ) : (
            events.map((event) => (
              <Link
                key={event.id}
                href={`/organizer/events/${event.id}`}
                className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4 transition-colors hover:border-violet-neon/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{event.title}</p>
                  <p className="text-xs text-muted">{formatDateTime(event.startsAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{event.registrationsCount} registered</Badge>
                  <Badge
                    tone={
                      event.status === "PUBLISHED"
                        ? "success"
                        : event.status === "CANCELLED"
                        ? "danger"
                        : "neutral"
                    }
                  >
                    {event.status === "PUBLISHED"
                      ? "Live"
                      : event.status === "CANCELLED"
                      ? "Cancelled"
                      : "Draft"}
                  </Badge>
                </div>
              </Link>
            ))
          )}
        </div>
      ) : tab === "create" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <EventForm />
          <aside className="glass h-fit space-y-3 rounded-3xl p-5">
            <h2 className="text-base font-bold">Your events</h2>
            {events.length === 0 ? (
              <p className="text-sm text-muted">No events yet.</p>
            ) : (
              events.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="block rounded-2xl border border-zinc-200 p-3 text-sm transition-colors hover:border-violet-neon dark:border-white/10"
                >
                  <span className="block font-semibold">{event.title}</span>
                  <span className="block text-xs text-muted">
                    {formatDateTime(event.startsAt)}
                  </span>
                  <Badge tone="neutral" className="mt-2">
                    {event.registrationsCount} registered
                  </Badge>
                </Link>
              ))
            )}
          </aside>
        </div>
      ) : tab === "verify" ? (
        <VerificationQueue orders={pending} />
      ) : (
        /* analytics */
        <div className="space-y-6">
          {events.length === 0 ? (
            <p className="glass rounded-3xl p-5 text-sm text-muted">
              No events yet.
            </p>
          ) : (
            events.map((event, index) => {
              const analytics = analyticsData[index];
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
                  <AnalyticsPanel analytics={analytics} />
                </div>
              );
            })
          )}
        </div>
      )}
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
