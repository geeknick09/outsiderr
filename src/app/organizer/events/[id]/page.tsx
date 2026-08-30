import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { BarChart2, ChevronLeft } from "lucide-react";

import { AnalyticsPanel } from "@/components/organizer/analytics-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { getOrganizerEventAnalytics, updateEventStatus } from "@/lib/data/organizer";
import { formatDateRange } from "@/lib/format";
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

  // Handle status toggle server-side via query param
  if (action === "publish" || action === "cancel") {
    const newStatus: EventStatus = action === "publish" ? "PUBLISHED" : "CANCELLED";
    await updateEventStatus(user, id, newStatus);
    redirect(`/organizer/events/${id}`);
  }

  const [event, analytics] = await Promise.all([
    getEvent(id),
    getOrganizerEventAnalytics(user, id),
  ]);

  if (!event || !analytics) notFound();

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
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone="violet">{CATEGORY_LABELS[event.category]}</Badge>
        <Badge
          tone={
            event.status === "PUBLISHED"
              ? "success"
              : event.status === "CANCELLED"
              ? "danger"
              : "neutral"
          }
        >
          {event.status === "PUBLISHED" ? "Live" : event.status === "CANCELLED" ? "Cancelled" : "Draft"}
        </Badge>
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
        {event.status === "PUBLISHED" ? (
          <form action={`/organizer/events/${event.id}?action=cancel`} method="GET">
            <Button type="submit" variant="secondary" size="sm">
              Cancel event
            </Button>
          </form>
        ) : event.status === "DRAFT" ? (
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
    </div>
  );
}
