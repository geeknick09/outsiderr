import { Children, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import { BadgeCheck } from "lucide-react";

import { EventCard } from "./event-card";
import { PastEventCard } from "./past-event-card";
import type { EventSummary } from "@/modules/shared";

type OrganizerResult = {
  id: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  verified: boolean | null;
};

export function SearchResults({
  query,
  upcomingEvents,
  pastEvents,
  organizers,
}: {
  query: string;
  upcomingEvents: EventSummary[];
  pastEvents: EventSummary[];
  organizers: OrganizerResult[];
}) {
  return (
    <div className="space-y-8">
      <SearchSection
        title="Live & Upcoming Events"
        emptyMessage={`No events are happening with “${query}” right now.`}
        ariaLabel="Live and upcoming event search results"
      >
        {upcomingEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            className="w-[72vw] max-w-[260px] shrink-0 snap-start"
          />
        ))}
      </SearchSection>

      <SearchSection
        title="Past Events"
        emptyMessage={`No past events found with “${query}”.`}
        ariaLabel="Past event search results"
      >
        {pastEvents.map((event) => (
          <PastEventCard
            key={event.id}
            event={event}
            className="w-[72vw] max-w-[260px] shrink-0 snap-start"
          />
        ))}
      </SearchSection>

      <SearchSection
        title="Organizers"
        emptyMessage={`No organizers found with “${query}”.`}
        ariaLabel="Organizer search results"
      >
        {organizers.map((organizer) => (
          <Link
            key={organizer.id}
            href={`/organizers/${organizer.id}`}
            className="glass flex w-[78vw] max-w-[300px] shrink-0 snap-start items-center gap-3 rounded-2xl p-4 transition-all hover:border-violet-neon/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)]"
          >
            {organizer.avatarUrl ? (
              <Image
                src={organizer.avatarUrl}
                alt={organizer.name}
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neon-gradient text-base font-bold text-white">
                {organizer.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1 truncate text-sm font-bold">
                <span className="truncate">{organizer.name}</span>
                {organizer.verified ? <BadgeCheck className="h-4 w-4 shrink-0 text-violet-neon" /> : null}
              </p>
              {organizer.bio ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{organizer.bio}</p> : null}
            </div>
          </Link>
        ))}
      </SearchSection>
    </div>
  );
}

function SearchSection({
  title,
  emptyMessage,
  ariaLabel,
  children,
}: {
  title: string;
  emptyMessage: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-black tracking-tight">{title}</h2>
      {Children.count(children) > 0 ? (
        <div
          aria-label={ariaLabel}
          className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3"
        >
          {children}
        </div>
      ) : (
        <p className="glass rounded-2xl px-4 py-5 text-sm text-muted">{emptyMessage}</p>
      )}
    </section>
  );
}
