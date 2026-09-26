import { Suspense } from "react";
import Link from "next/link";

import { CategoryFilter } from "@/modules/web";
import { EventSearch } from "@/modules/web";
import { EventSection } from "@/modules/web";
import { FeaturedCarousel } from "@/modules/web";
import { HeroCarousel } from "@/modules/web";
import { PastEventSection } from "@/modules/web";
import {
  CATEGORY_LABELS,
  CITY_LABELS,
  DEFAULT_CITY,
} from "@/modules/shared";
import { listEvents, searchOrganizers } from "@/modules/shared/server";
import { getHeroEvents } from "@/modules/shared/server";
import { getMyEventsToday } from "@/modules/shared/server";
import {
  getHeroBoostEnabled,
  getHeroMaxVisibleEvents,
  getHeroRotationIntervalMinutes,
  getMaxPopularPerCity,
  getMaxSponsoredPerCity,
  getTaglineHeader,
  getTaglineSubheader,
} from "@/modules/shared/server";
import { getCurrentUser } from "@/modules/shared/server";
import { formatDateTime, isPast, isToday } from "@/modules/shared";
import type { City, EventCategory } from "@/modules/shared";

// Revalidate the home page every 60 seconds.
// Event mutations (create/edit/publish/cancel) call revalidatePath("/")
// for immediate invalidation, so listings stay fresh while benefiting from cache.
export const revalidate = 60;

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; category?: string; q?: string }>;
}) {
  const params = await searchParams;
  const city: City =
    params.city && CITY_LABELS[params.city as City]
      ? (params.city as City)
      : DEFAULT_CITY;
  const category =
    params.category && CATEGORY_LABELS[params.category as EventCategory]
      ? (params.category as EventCategory)
      : undefined;
  const search = params.q?.trim() || undefined;

  // Parallelize all data fetching — events + settings + user at the same time
  const [allEvents, maxPopular, maxSponsored, heroEnabled, heroRotationInterval, heroMaxVisible, taglineHeader, taglineSubheader, currentUser, matchedOrganizers] = await Promise.all([
    listEvents({ city, category, search }),
    getMaxPopularPerCity(),
    getMaxSponsoredPerCity(),
    getHeroBoostEnabled(),
    getHeroRotationIntervalMinutes(),
    getHeroMaxVisibleEvents(),
    getTaglineHeader(),
    getTaglineSubheader(),
    getCurrentUser(),
    search ? searchOrganizers(search) : Promise.resolve([]),
  ]);

  // Split into upcoming (today + future) and past events
  const upcoming = allEvents.filter((event) => !isPast(event.startsAt));
  const past = allEvents
    .filter((event) => isPast(event.startsAt))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  // Postponed events are still live — show them in their own section
  const postponed = upcoming.filter((event) => event.status === "POSTPONED");
  const live = upcoming.filter((event) => event.status !== "POSTPONED");

  const featured = live
    .filter((event) => event.isFeatured)
    .slice(0, maxSponsored);
  const today = live.filter((event) => isToday(event.startsAt));
  const popular = [...live]
    .sort((a, b) => b.registrationsCount - a.registrationsCount)
    .slice(0, maxPopular);

  // Hero Boost events — only fetch if enabled
  const heroEvents = heroEnabled
    ? await getHeroEvents(heroRotationInterval, heroMaxVisible)
    : [];

  // "Your Events Today" — only for logged-in users
  const myEventsToday = currentUser ? await getMyEventsToday(currentUser) : [];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {taglineHeader}
          </p>
          <p className="mt-1 text-sm text-muted">
            {taglineSubheader}
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-violet-neon">
            {CITY_LABELS[city]}
          </p>
        </div>
        {/* Clubs & Crews disabled for this release */}
        {/*
        <Link
          href="/clubs"
          className="shrink-0 rounded-full bg-neon-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90"
        >
          Join a Club / Crew
        </Link>
        */}
      </div>

      <Suspense fallback={<div className="mb-6 h-12" />}>
        <EventSearch />
      </Suspense>

      <Suspense fallback={<div className="mb-6 h-14" />}>
        <CategoryFilter active={category ?? "ALL"} />
      </Suspense>

      {/* Organizers matching the search term */}
      {matchedOrganizers.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-muted">Organizers</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {matchedOrganizers.map((org) => (
              <Link
                key={org.id}
                href={`/organizers/${org.id}`}
                className="glass flex min-w-[220px] items-center gap-3 rounded-2xl p-4 transition-all hover:border-violet-neon/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)]"
              >
                {org.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.avatarUrl} alt={org.name} className="h-11 w-11 rounded-full object-cover" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neon-gradient text-base font-bold text-white">
                    {org.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {org.name}
                    {org.verified ? <span className="ml-1 text-violet-neon" title="Verified">✓</span> : null}
                  </p>
                  {org.bio ? <p className="mt-0.5 line-clamp-1 text-xs text-muted">{org.bio}</p> : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Hero Boost carousel — only shown in "All" view (no category filter) */}
      {!category && heroEvents.length > 0 ? <HeroCarousel events={heroEvents} /> : null}

      {/* Your Events Today — only for logged-in users with events today */}
      {myEventsToday.length > 0 ? (
        <section className="mb-10">
          <div className="mb-3">
            <h2 className="text-xl font-black tracking-tight">Your Events Today</h2>
            <p className="text-sm text-muted">Don&apos;t miss out — these are happening today!</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myEventsToday.map((ev) => (
              <Link
                key={ev.eventId}
                href={`/events/${ev.eventId}`}
                className="glass block rounded-2xl p-4 transition-all hover:border-violet-neon/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)]"
              >
                <p className="text-sm font-bold">{ev.eventTitle}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatDateTime(ev.startsAt)} · {ev.venueName}
                </p>
                <p className="mt-1 text-xs font-semibold text-violet-neon">{ev.tierName}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <FeaturedCarousel events={featured} />

      <EventSection
        title="Happening Today"
        subtitle="Doors open in a few hours"
        events={today}
      />
      <EventSection title="Popular Events" events={popular} />
      <EventSection title="All Events" events={live} />

      {postponed.length > 0 ? (
        <EventSection
          title="Postponed Events"
          subtitle="New dates announced — stay tuned"
          events={postponed}
        />
      ) : null}

      <PastEventSection
        title="Past Events"
        subtitle="Already completed — for reference only"
        events={past}
      />

      {live.length === 0 && postponed.length === 0 && past.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center">
          <h2 className="text-lg font-bold">
            {search ? `No results for "${search}"` : "Nothing here yet"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {search
              ? `Try a different search term, city, or category.`
              : `No ${category ? CATEGORY_LABELS[category].toLowerCase() : "events"} in ${CITY_LABELS[city]} right now. Try another city or category.`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
