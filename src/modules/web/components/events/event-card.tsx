import Image from "next/image";
import Link from "next/link";
import { MapPin } from "lucide-react";

import { Badge } from "@/modules/shared";
import { CATEGORY_LABELS } from "@/modules/shared";
import { formatDateBadge, formatPriceTag, isPast } from "@/modules/shared";
import type { EventSummary } from "@/modules/shared";
import { cn } from "@/modules/shared";
import { CardTeaserVideo } from "./card-teaser-video";

export function EventCard({
  event,
  className,
  showSponsored = false,
}: {
  event: EventSummary;
  className?: string;
  showSponsored?: boolean;
}) {
  const date = formatDateBadge(event.startsAt);

  return (
    <Link
      href={`/events/${event.id}`}
      className={cn(
        "group glass block overflow-hidden rounded-3xl transition-all duration-300",
        "hover:-translate-y-1 hover:border-violet-neon/50 hover:shadow-[0_0_28px_rgba(139,92,246,0.35)]",
        className,
      )}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-200 dark:bg-white/5">
        {event.cardPosterUrl ? (
          <Image
            src={event.cardPosterUrl}
            alt={event.title}
            fill
            sizes="(max-width: 640px) 50vw, 280px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-neon-gradient opacity-70" />
        )}

        {/* Teaser video — muted autoplay over the poster for upcoming events.
            Past/cancelled events keep the photo card. */}
        {event.teaserVideoUrl && !isPast(event.startsAt) && event.status !== "CANCELLED" ? (
          <CardTeaserVideo src={event.teaserVideoUrl} poster={event.cardPosterUrl} />
        ) : null}

        <div className="absolute left-3 top-3 flex flex-col items-center rounded-2xl bg-black/70 px-2.5 py-1.5 text-white backdrop-blur-md">
          <span className="text-base font-black leading-none">{date.day}</span>
          <span className="text-[10px] font-bold tracking-widest text-lime-neon">
            {date.month}
          </span>
        </div>

        {showSponsored && event.isFeatured ? (
          <div className="absolute right-3 top-3">
            <Badge tone="lime" className="shadow-glow-lime">
              Sponsored
            </Badge>
          </div>
        ) : null}

        {event.status === "POSTPONED" ? (
          <div className="absolute right-3 top-3">
            <Badge tone="warning" className="bg-black/60 text-amber-300">
              Postponed
            </Badge>
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {(event.categories ?? [event.category]).slice(0, 2).map((cat) => (
              <Badge key={cat} tone="violet" className="bg-black/50 text-white">
                {CATEGORY_LABELS[cat]}
              </Badge>
            ))}
            {(event.categories ?? []).length > 2 ? (
              <Badge tone="violet" className="bg-black/50 text-white">
                +{event.categories.length - 2}
              </Badge>
            ) : null}
          </div>
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-zinc-900">
            {formatPriceTag(event.minPricePaise)}
          </span>
        </div>
      </div>

      <div className="space-y-1 p-4">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug">{event.title}</h3>
        <p className="flex items-center gap-1 text-xs text-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{event.venueName}</span>
        </p>
      </div>
    </Link>
  );
}
