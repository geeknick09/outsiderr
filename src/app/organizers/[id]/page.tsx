import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, CalendarDays } from "lucide-react";

import { EventCard } from "@/components/events/event-card";
import { getPublicOrganizer, listPublicOrganizerEvents } from "@/lib/data/organizers";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const org = await getPublicOrganizer((await params).id);
  return {
    title: org ? `${org.name} — Outsiderr` : "Organizer — Outsiderr",
    description: org?.bio ?? undefined,
  };
}

export default async function PublicOrganizerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [organizer, events] = await Promise.all([
    getPublicOrganizer(id),
    listPublicOrganizerEvents(id),
  ]);

  if (!organizer) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-8">
      {/* Profile header */}
      <div className="flex items-center gap-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-neon-gradient text-3xl font-black text-white shadow-glow-violet">
          {organizer.name.slice(0, 1)}
        </div>
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
            {organizer.name}
            {organizer.verified ? (
              <BadgeCheck className="h-7 w-7 text-violet-neon" />
            ) : null}
          </h1>
          {organizer.bio ? (
            <p className="mt-1 max-w-xl text-sm text-muted">{organizer.bio}</p>
          ) : null}
        </div>
      </div>

      {/* Events */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-violet-neon" />
          <h2 className="text-xl font-bold">Events</h2>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
            {events.length}
          </span>
        </div>

        {events.length === 0 ? (
          <p className="glass rounded-3xl p-6 text-sm text-muted">
            No published events yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
