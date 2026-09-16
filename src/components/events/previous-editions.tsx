import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Star } from "lucide-react";

import { formatDateRange } from "@/lib/format";

interface LinkedEvent {
  id: string;
  title: string;
  startsAt: string;
  cardPosterUrl: string | null;
  rating: number;
  reviewCount: number;
}

interface PreviousEditionsProps {
  events: LinkedEvent[];
}

export function PreviousEditions({ events }: PreviousEditionsProps) {
  if (events.length === 0) return null;

  // Calculate aggregate rating across all linked events
  const eventsWithRatings = events.filter((e) => e.reviewCount > 0);
  const totalReviews = eventsWithRatings.reduce((sum, e) => sum + e.reviewCount, 0);
  const avgRating =
    totalReviews > 0
      ? Math.round(
          (eventsWithRatings.reduce((sum, e) => sum + e.rating * e.reviewCount, 0) / totalReviews) * 10,
        ) / 10
      : 0;

  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <CalendarDays className="h-4 w-4 text-violet-neon" />
          Previous Editions
        </h2>
        {totalReviews > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-violet-neon/10 px-3 py-1">
            <Star className="h-3.5 w-3.5 fill-violet-neon text-violet-neon" />
            <span className="text-xs font-bold text-violet-neon">{avgRating}</span>
            <span className="text-xs text-muted">({totalReviews} reviews)</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/events/${event.id}`}
            className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-3 transition-colors hover:border-violet-neon/40 hover:bg-violet-neon/5 dark:border-white/10"
          >
            {event.cardPosterUrl ? (
              <Image
                src={event.cardPosterUrl}
                alt={event.title}
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neon-gradient text-sm font-black text-white">
                {event.title.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{event.title}</p>
              <p className="text-xs text-muted">{formatDateRange(event.startsAt, null)}</p>
            </div>
            {event.reviewCount > 0 && (
              <div className="flex shrink-0 items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-violet-neon text-violet-neon" />
                <span className="text-xs font-bold">{event.rating}</span>
                <span className="text-xs text-muted">({event.reviewCount})</span>
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
