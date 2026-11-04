"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, LayoutDashboard } from "lucide-react";

import { Badge, Button, CATEGORY_LABELS, formatDateRange, ShareButton } from "@/modules/shared";
import type { BadgeTone, EventDetail } from "@/modules/shared";
import { useEventEdits } from "./manage-event-context";

/**
 * Manage-page header (banner + title + dates + badges). Server-rendered props
 * are merged with overrides patched by edit sections on save, so saved values
 * appear immediately instead of flashing old data until router.refresh lands.
 */
export function ManageEventHeader({
  event,
  statusTone,
  statusLabel,
  isOwner,
  accessLevel,
}: {
  event: EventDetail;
  statusTone: BadgeTone;
  statusLabel: string;
  isOwner: boolean;
  accessLevel: string;
}) {
  const edits = useEventEdits();
  const merged = { ...event, ...(edits?.overrides ?? {}) } as EventDetail;
  const bannerUrl = merged.bannerPosterUrl ?? merged.cardPosterUrl;

  return (
    <>
      {bannerUrl ? (
        <div className="relative -mx-4 aspect-[3/4] max-h-[70vh] w-[calc(100%+2rem)] overflow-hidden sm:aspect-video sm:max-h-[440px] sm:w-full sm:rounded-b-3xl">
          <Image
            src={bannerUrl}
            alt={merged.title}
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-50 via-zinc-50/20 to-transparent dark:from-ink dark:via-ink/30" />
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Link href="/organizer" className="text-muted hover:text-violet-neon">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-black tracking-tight">{merged.title}</h1>
          <p className="text-sm text-muted">{formatDateRange(merged.startsAt, merged.endsAt)}</p>
        </div>
        <Link href="/organizer">
          <Button variant="secondary" size="sm">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone="violet">{CATEGORY_LABELS[merged.category as keyof typeof CATEGORY_LABELS] || merged.category}</Badge>
        <Badge tone={statusTone}>{statusLabel}</Badge>
        {merged.isFeatured ? <Badge tone="lime">Boosted</Badge> : null}
        {!isOwner ? <Badge tone="violet">Co-organizer · {accessLevel}</Badge> : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href={`/events/${merged.id}`} target="_blank">
          <Button variant="secondary" size="sm">View event page ↗</Button>
        </Link>
        <ShareButton
          url={`/events/${merged.id}`}
          title={merged.title}
          variant="secondary"
          size="sm"
        />
      </div>
    </>
  );
}
