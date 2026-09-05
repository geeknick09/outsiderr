import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AtSign, BadgeCheck, CalendarDays, Clock, Globe, Link2, MessageCircle, Play } from "lucide-react";

import { EventCard } from "@/components/events/event-card";
import { Badge } from "@/components/ui/badge";
import { getPublicOrganizer, listPublicOrganizerEvents } from "@/lib/data/organizers";
import { isPast } from "@/lib/format";

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

  const upcoming = events.filter((e) => !isPast(e.startsAt));
  const past = events.filter((e) => isPast(e.startsAt));

  return (
    <div className="-mt-6">
      {/* Cover banner */}
      <div className="relative h-48 w-full overflow-hidden sm:h-64 sm:rounded-b-3xl">
        {organizer.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organizer.coverUrl}
            alt={`${organizer.name} cover`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-neon-gradient" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-50 via-zinc-50/20 to-transparent dark:from-ink dark:via-ink/30" />
      </div>

      <div className="mx-auto max-w-5xl space-y-8 px-4">
        {/* Profile header — avatar overlapping cover */}
        <div className="flex items-end gap-5 -mt-16">
          {organizer.avatarUrl ? (
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl border-4 border-zinc-50 shadow-lg dark:border-ink sm:h-28 sm:w-28">
              <Image
                src={organizer.avatarUrl}
                alt={organizer.name}
                fill
                sizes="112px"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border-4 border-zinc-50 bg-neon-gradient text-3xl font-black text-white shadow-lg dark:border-ink sm:h-28 sm:w-28">
              {organizer.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="pb-2">
            <h1 className="flex items-start gap-2 text-2xl font-black tracking-tight sm:text-3xl">
              <span className="break-words">{organizer.name}</span>
              {organizer.verified ? (
                <BadgeCheck className="mt-1 h-7 w-7 shrink-0 text-violet-neon" />
              ) : null}
            </h1>
            {/* Social icons */}
            <div className="mt-1 flex items-center gap-3">
              {organizer.instagramUrl ? (
                <a
                  href={organizer.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted hover:text-violet-neon"
                  aria-label="Instagram"
                >
                  <AtSign className="h-5 w-5" />
                </a>
              ) : null}
              {organizer.youtubeUrl ? (
                <a
                  href={organizer.youtubeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted hover:text-violet-neon"
                  aria-label="YouTube"
                >
                  <Play className="h-5 w-5" />
                </a>
              ) : null}
              {organizer.xUrl ? (
                <a
                  href={organizer.xUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted hover:text-violet-neon"
                  aria-label="X"
                >
                  <MessageCircle className="h-5 w-5" />
                </a>
              ) : null}
              {organizer.facebookUrl ? (
                <a
                  href={organizer.facebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted hover:text-violet-neon"
                  aria-label="Facebook"
                >
                  <Globe className="h-5 w-5" />
                </a>
              ) : null}
              {organizer.linkedinUrl ? (
                <a
                  href={organizer.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted hover:text-violet-neon"
                  aria-label="LinkedIn"
                >
                  <Link2 className="h-5 w-5" />
                </a>
              ) : null}
            </div>
            {organizer.bio ? (
              <p className="mt-1 max-w-xl text-sm text-muted line-clamp-2">{organizer.bio}</p>
            ) : null}
          </div>
        </div>

        {/* About / Description section — separate from header, no overlap */}
        {organizer.description ? (
          <section className="glass rounded-3xl p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">About</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {organizer.description}
            </p>
          </section>
        ) : null}

        {/* Upcoming Events */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-violet-neon" />
            <h2 className="text-xl font-bold">Upcoming Events</h2>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
              {upcoming.length}
            </span>
          </div>

          {upcoming.length === 0 ? (
            <p className="glass rounded-3xl p-6 text-sm text-muted">
              No upcoming events yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {upcoming.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>

        {/* Past Events */}
        {past.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted" />
              <h2 className="text-xl font-bold">Past Events</h2>
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
                {past.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {past.map((event) => (
                <div key={event.id} className="relative">
                  <EventCard event={event} />
                  <div className="pointer-events-none absolute right-3 top-3">
                    <Badge tone="neutral">Completed</Badge>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
