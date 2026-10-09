import { Suspense } from "react";
import Link from "next/link";

import { CategoryFilter } from "@/modules/web";
import { EventSearch } from "@/modules/web";
import { EventSection } from "@/modules/web";
import { FeaturedCarousel } from "@/modules/web";
import { HeroCarousel } from "@/modules/web";
import { PastEventSection } from "@/modules/web";
import { SearchResults } from "@/modules/web";
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
import { formatDateTime, isToday, cityLabel, normalizeCityKey } from "@/modules/shared";
import { partitionSearchEvents } from "@/modules/web";
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
  const city: City = params.city ? normalizeCityKey(params.city) : DEFAULT_CITY;
  const category =
    params.category && CATEGORY_LABELS[params.category as EventCategory]
      ? (params.category as EventCategory)
      : undefined;
  const search = params.q?.trim() || undefined;

  // Parallelize all data fetching - events + settings + user at the same time.
  // No city filter on the fetch: the city-scoped sections derive from the full
  // set so "Events in your city" and "All Events" can coexist on one fetch.
  const [allEvents, maxPopular, maxSponsored, heroEnabled, heroRotationInterval, heroMaxVisible, taglineHeader, taglineSubheader, currentUser, matchedOrganizers] = await Promise.all([
    listEvents({ category, search }),
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

  const { upcoming, past } = partitionSearchEvents(allEvents);

  // Postponed events stay in the normal live listing - they're still live.
  // City-scoped slices drive the curated sections; `upcoming` stays all-cities
  // for the "All Events" grid.
  const live = upcoming;
  const cityLive = live.filter((event) => event.city === city);
  const cityPast = past.filter((event) => event.city === city);

  const featured = cityLive
    .filter((event) => event.isFeatured)
    .slice(0, maxSponsored);
  const today = cityLive.filter((event) => isToday(event.startsAt));
  const popular = [...cityLive]
    .sort((a, b) => b.registrationsCount - a.registrationsCount)
    .slice(0, maxPopular);

  // Hero Boost events - only fetch if enabled
  const heroEvents = heroEnabled
    ? await getHeroEvents(heroRotationInterval, heroMaxVisible)
    : [];

  // "Your Events Today" - only for logged-in users
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
            {cityLabel(city)}
          </p>
        </div>
        {/* Communities & Crews disabled for this release */}
        {/*
        <Link
          href="/communities"
          className="shrink-0 rounded-full bg-neon-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90"
        >
          Join a Community / Crew
        </Link>
        */}
      </div>

      <Suspense fallback={<div className="mb-6 h-12" />}>
        <EventSearch />
      </Suspense>

      <Suspense fallback={<div className="mb-6 h-14" />}>
        <CategoryFilter active={category ?? "ALL"} />
      </Suspense>

      {search ? (
        <SearchResults
          query={search}
          upcomingEvents={upcoming}
          pastEvents={past}
          organizers={matchedOrganizers}
        />
      ) : (
        <>
      {/* Hero Boost carousel - only shown in "All" view (no category filter) */}
      {!category && heroEvents.length > 0 ? <HeroCarousel events={heroEvents} /> : null}

      {/* Your Events Today - only for logged-in users with events today */}
      {myEventsToday.length > 0 ? (
        <section className="mb-10">
          <div className="mb-3">
            <h2 className="text-xl font-black tracking-tight">Your Events Today</h2>
            <p className="text-sm text-muted">Don&apos;t miss out - these are happening today!</p>
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
      <EventSection
        title={`Events in ${cityLabel(city)}`}
        subtitle="Happening near you"
        events={cityLive}
      />
      <EventSection title="All Events" events={live} />

      <PastEventSection
        title="Past Events"
        subtitle="Already completed - for reference only"
        events={cityPast}
      />

      {live.length === 0 && past.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center">
          <h2 className="text-lg font-bold">Nothing here yet</h2>
          <p className="mt-1 text-sm text-muted">
            No {category ? CATEGORY_LABELS[category].toLowerCase() : "events"} in {cityLabel(city)} right now. Try another city or category.
          </p>
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}
