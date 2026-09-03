import Image from "next/image";
import { MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS } from "@/lib/constants";
import { formatDateBadge, formatPriceTag } from "@/lib/format";
import type { EventSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Non-interactive card for past/completed events.
 * Renders the same visual as EventCard but is not clickable.
 */
export function PastEventCard({
  event,
  className,
}: {
  event: EventSummary;
  className?: string;
}) {
  const date = formatDateBadge(event.startsAt);

  return (
    <div
      className={cn(
        "group glass block overflow-hidden rounded-3xl opacity-60 grayscale transition-all duration-300",
        "pointer-events-none cursor-not-allowed select-none",
        className,
      )}
      aria-disabled
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-200 dark:bg-white/5">
        {event.cardPosterUrl ? (
          <Image
            src={event.cardPosterUrl}
            alt={event.title}
            fill
            sizes="(max-width: 640px) 50vw, 280px"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full bg-neon-gradient opacity-70" />
        )}

        <div className="absolute left-3 top-3 flex flex-col items-center rounded-2xl bg-black/70 px-2.5 py-1.5 text-white backdrop-blur-md">
          <span className="text-base font-black leading-none">{date.day}</span>
          <span className="text-[10px] font-bold tracking-widest text-lime-neon">
            {date.month}
          </span>
        </div>

        <div className="absolute right-3 top-3">
          <Badge tone="neutral" className="bg-black/60 text-white">
            Completed
          </Badge>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <Badge tone="violet" className="bg-black/50 text-white">
            {CATEGORY_LABELS[event.category]}
          </Badge>
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
    </div>
  );
}
