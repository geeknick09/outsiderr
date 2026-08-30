import { Suspense } from "react";

import { CategoryFilter } from "@/components/events/category-filter";
import { EventSection } from "@/components/events/event-section";
import { FeaturedCarousel } from "@/components/events/featured-carousel";
import {
  CATEGORY_LABELS,
  CITY_LABELS,
  DEFAULT_CITY,
  MAX_FEATURED_EVENTS,
} from "@/lib/constants";
import { listEvents } from "@/lib/data/events";
import { isToday } from "@/lib/format";
import type { City, EventCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; category?: string }>;
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

  const events = await listEvents({ city, category });
  const featured = events
    .filter((event) => event.isFeatured)
    .slice(0, MAX_FEATURED_EVENTS);
  const today = events.filter((event) => isToday(event.startsAt));
  const popular = [...events]
    .sort((a, b) => b.registrationsCount - a.registrationsCount)
    .slice(0, 8);

  return (
    <div>
      <div className="mb-6">
        <h1 className="bg-neon-gradient bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
          Outsiderr
        </h1>
        <p className="mt-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Cyphers, block parties, battles, stunts, skates, meetups, jams &amp; real
          communities.
        </p>
        <p className="mt-1 text-sm text-muted">
          Discover raw underground events happening today near you.
        </p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-violet-neon">
          {CITY_LABELS[city]}
        </p>
      </div>

      <Suspense fallback={<div className="mb-6 h-14" />}>
        <CategoryFilter active={category ?? "ALL"} />
      </Suspense>

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
      <EventSection title="All Events" events={events} />

      {events.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center">
          <h2 className="text-lg font-bold">Nothing here yet</h2>
          <p className="mt-1 text-sm text-muted">
            No {category ? CATEGORY_LABELS[category].toLowerCase() : "events"} in{" "}
            {CITY_LABELS[city]} right now. Try another city or category.
          </p>
        </div>
      ) : null}
    </div>
  );
}
