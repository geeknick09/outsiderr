"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Flame, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatPriceTag } from "@/lib/format";
import type { HeroEvent } from "@/lib/types";

const AUTO_ROTATE_MS = 6000;

export function HeroCarousel({ events }: { events: HeroEvent[] }) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (events.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % events.length);
    }, AUTO_ROTATE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [events.length]);

  if (events.length === 0) return null;

  function go(direction: 1 | -1) {
    setCurrent((prev) => (prev + direction + events.length) % events.length);
  }

  const event = events[current];
  const poster = event.bannerPosterUrl ?? event.cardPosterUrl;

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-black tracking-tight">
          <Flame className="h-5 w-5 text-pink-neon" />
          Hero Events
        </h2>
        <div className="flex gap-2">
          <CarouselButton label="Previous" onClick={() => go(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </CarouselButton>
          <CarouselButton label="Next" onClick={() => go(1)}>
            <ChevronRight className="h-4 w-4" />
          </CarouselButton>
        </div>
      </div>

      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10 sm:aspect-[21/9]">
        <Link href={`/events/${event.id}?source=HERO_BOOST`} className="group block h-full w-full">
          {poster ? (
            <Image
              src={poster}
              alt={event.title}
              fill
              sizes="100vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              priority
            />
          ) : (
            <div className="h-full w-full bg-neon-gradient" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

          <div className="absolute left-4 top-4">
            <Badge tone="pink">
              Featured
            </Badge>
          </div>

          {/* Dots indicator */}
          {events.length > 1 ? (
            <div className="absolute right-4 top-4 flex gap-1.5">
              {events.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrent(i);
                  }}
                  className={`h-2 rounded-full transition-all ${
                    i === current ? "w-6 bg-white" : "w-2 bg-white/40"
                  }`}
                />
              ))}
            </div>
          ) : null}

          <div className="absolute inset-x-4 bottom-4 space-y-2 text-white">
            <h3 className="text-2xl font-black leading-tight sm:text-3xl">{event.title}</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-200 sm:text-sm">
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
      className="glass flex h-9 w-9 items-center justify-center rounded-full transition-all hover:shadow-[0_0_16px_rgba(236,72,153,0.4)]"
    >
      {children}
    </button>
  );
}
