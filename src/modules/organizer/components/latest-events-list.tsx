"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { formatDateRange } from "@/modules/shared";

interface LatestEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
}

/**
 * Latest events list with a client-side title search. Shows the 10 most
 * recent by default; searching filters the organizer's full list.
 */
export function LatestEventsList({ events }: { events: LatestEvent[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q
    ? events.filter((e) => e.title.toLowerCase().includes(q))
    : events.slice(0, 10);

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your events…"
          className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
      </div>

      <div className="space-y-1.5">
        {visible.map((event) => (
          <Link
            key={event.id}
            href={`/organizer/events/${event.id}`}
            target="_blank"
            className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
          >
            <span className="truncate">{event.title}</span>
            <span className="ml-3 shrink-0 text-xs text-muted">
              {formatDateRange(event.startsAt, event.endsAt ?? null)} ↗
            </span>
          </Link>
        ))}
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-sm text-muted dark:border-white/10">
            No events match &ldquo;{query}&rdquo;.
          </p>
        ) : null}
      </div>
    </div>
  );
}
