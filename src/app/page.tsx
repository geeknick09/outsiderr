import { Suspense } from "react";
import Link from "next/link";

import { CategoryFilter } from "@/components/events/category-filter";
import { EventSearch } from "@/components/events/event-search";
import { EventSection } from "@/components/events/event-section";
import { FeaturedCarousel } from "@/components/events/featured-carousel";
import { HeroCarousel } from "@/components/events/hero-carousel";
import { PastEventSection } from "@/components/events/past-event-section";
import {
  CATEGORY_LABELS,
  CITY_LABELS,
  DEFAULT_CITY,
  MAX_FEATURED_EVENTS,
} from "@/lib/constants";
import { listEvents } from "@/lib/data/events";
import { getHeroEvents } from "@/lib/data/hero-boosts";
import {
  getHeroBoostEnabled,
  getHeroMaxVisibleEvents,
  getHeroRotationIntervalMinutes,
  getTaglineHeader,
  getTaglineSubheader,
} from "@/lib/data/platform-settings";
import { isPast, isToday } from "@/lib/format";
import type { City, EventCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

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

  const allEvents = await listEvents({ city, category, search });

  // Split into upcoming (today + future) and past events
  const upcoming = allEvents.filter((event) => !isPast(event.startsAt));
  const past = allEvents
    .filter((event) => isPast(event.startsAt))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  const featured = upcoming
    .filter((event) => event.isFeatured)
    .slice(0, MAX_FEATURED_EVENTS);
  const today = upcoming.filter((event) => isToday(event.startsAt));
  const popular = [...upcoming]
    .sort((a, b) => b.registrationsCount - a.registrationsCount)
    .slice(0, 8);

  // Hero Boost events
  const heroEnabled = await getHeroBoostEnabled();
  const heroRotationInterval = await getHeroRotationIntervalMinutes();
  const heroMaxVisible = await getHeroMaxVisibleEvents();
  const taglineHeader = await getTaglineHeader();
  const taglineSubheader = await getTaglineSubheader();
  const heroEvents = heroEnabled
    ? await getHeroEvents(heroRotationInterval, heroMaxVisible)
    : [];

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
        <Link
          href="/clubs"
          className="shrink-0 rounded-full bg-neon-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90"
        >
          Join a Club / Crew
        </Link>
      </div>

      <Suspense fallback={<div className="mb-6 h-12" />}>
        <EventSearch />
      </Suspense>

      <Suspense fallback={<div className="mb-6 h-14" />}>
        <CategoryFilter active={category ?? "ALL"} />
      </Suspense>

      {/* Hero Boost carousel — only shown in "All" view (no category filter) */}
      {!category && heroEvents.length > 0 ? <HeroCarousel events={heroEvents} /> : null}

      <FeaturedCarousel events={featured} />

      <EventSection
        title="Happening Today"
        subtitle="Doors open in a few hours"
        events={today}
      />
      <EventSection
        title="Popular Events"
        subtitle="Ranked by registrations"
        events={popular}
      />
      <EventSection title="All Events" events={upcoming} />

      <PastEventSection
        title="Past Events"
        subtitle="Already completed — for reference only"
        events={past}
      />

      {upcoming.length === 0 && past.length === 0 ? (
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
