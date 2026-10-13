import Link from "next/link";
import { Sparkles } from "lucide-react";

import type { SlotBoostEvent } from "@/modules/shared/server";
import { formatDateTime } from "@/modules/shared";

/** Auto-scrolling sponsored slot strip - hidden when no boosts are active.
 * The list is duplicated so the marquee animation loops seamlessly. */
export function SlotBoostStrip({ events }: { events: SlotBoostEvent[] }) {
  if (events.length === 0) return null;

  const row = [...events, ...events]; // seamless loop
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-neon" />
        <h2 className="text-xl font-black tracking-tight">Sponsored</h2>
      </div>
      <div className="overflow-hidden">
        <div className="flex w-max gap-4 animate-marquee hover:[animation-play-state:paused]">
          {row.map((event, i) => (
            <Link
              key={`${event.id}-${i}`}
              href={`/events/${event.id}`}
              className="glass block w-56 shrink-0 overflow-hidden rounded-3xl transition-all hover:border-violet-neon/60"
            >
              {event.cardPosterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.cardPosterUrl}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-violet-neon/10 text-3xl font-black text-violet-neon">
                  {event.title.slice(0, 1)}
                </div>
              )}
              <div className="p-3">
                <p className="truncate text-sm font-bold">{event.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{formatDateTime(event.startsAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
