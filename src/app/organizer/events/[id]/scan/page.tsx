import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { lazy, Suspense } from "react";
import { ChevronLeft, ScanLine } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { getOrganizerProfile } from "@/lib/data/organizer";
import { formatDateRange } from "@/lib/format";

// Lazy load DoorScanner — html5-qrcode is ~110kB
const EventDoorScanner = lazy(() =>
  import("@/components/organizer/event-door-scanner").then((m) => ({ default: m.EventDoorScanner })),
);

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const event = await getEvent((await params).id);
  return { title: event ? `Scan: ${event.title} — Outsiderr` : "Door Scanner — Outsiderr" };
}

export default async function EventScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const [organizer, event] = await Promise.all([
    getOrganizerProfile(user),
    getEvent(id),
  ]);

  if (!organizer) redirect("/organizer");
  if (!event) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4 py-6">
      <div>
        <Link
          href={`/organizer/events/${event.id}`}
          className="flex items-center gap-1 text-sm text-muted hover:text-violet-neon"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to event
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <ScanLine className="h-6 w-6 text-violet-neon" />
          <h1 className="text-2xl font-black tracking-tight">Door Scanner</h1>
        </div>
        <p className="mt-1 text-sm font-semibold">{event.title}</p>
        <p className="text-xs text-muted">{formatDateRange(event.startsAt, event.endsAt)}</p>
      </div>

      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-2 rounded-2xl bg-violet-neon/10 p-3 text-xs text-violet-neon">
          <ScanLine className="h-4 w-4 shrink-0" />
          <p>
            Scanner is locked to <strong>{event.title}</strong>. Tickets from other
            events will be rejected automatically.
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="glass flex h-64 items-center justify-center rounded-3xl">
            <p className="text-sm text-muted">Loading scanner…</p>
          </div>
        }
      >
        <EventDoorScanner eventId={event.id} eventTitle={event.title} />
      </Suspense>
    </div>
  );
}
