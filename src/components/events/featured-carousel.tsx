"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatPriceTag } from "@/lib/format";
import type { EventSummary } from "@/lib/types";

export function FeaturedCarousel({ events }: { events: EventSummary[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  if (events.length === 0) return null;

  function scrollBy(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * 0.9, behavior: "smooth" });
  }

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight">Featured Events</h2>
        <div className="flex gap-2">
          <CarouselButton label="Previous" onClick={() => scrollBy(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </CarouselButton>
          <CarouselButton label="Next" onClick={() => scrollBy(1)}>
            <ChevronRight className="h-4 w-4" />
          </CarouselButton>
        </div>
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
      >
        {events.map((event) => {
          const poster = event.bannerPosterUrl ?? event.cardPosterUrl;
          return (
          <Link
            key={event.id}
            href={`/events/${event.id}`}
            className="group relative aspect-[16/9] w-[85%] shrink-0 snap-start overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10 sm:w-[60%] lg:w-[48%]"
          >
            {poster ? (
              <Image
                src={poster}
                alt={event.title}
                fill
                sizes="(max-width: 640px) 85vw, 48vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                priority
              />
            ) : (
              <div className="h-full w-full bg-neon-gradient" />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

            <div className="absolute left-4 top-4">
              <Badge tone="lime" className="shadow-glow-lime">
                Sponsored
              </Badge>
            </div>

            <div className="absolute inset-x-4 bottom-4 space-y-2 text-white">
              <h3 className="text-lg font-black leading-tight">{event.title}</h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-200">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDateTime(event.startsAt)}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {event.venueName}
                </span>
              </div>
              <span className="inline-block rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-zinc-900">
                {formatPriceTag(event.minPricePaise)}
              </span>
            </div>
          </Link>
          );
        })}
      </div>
    </section>
  );
}

function CarouselButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="glass flex h-9 w-9 items-center justify-center rounded-full transition-all hover:shadow-[0_0_16px_rgba(139,92,246,0.4)]"
    >
      {children}
    </button>
  );
}
