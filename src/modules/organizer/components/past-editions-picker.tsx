"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/modules/shared";

interface PastEvent {
  id: string;
  title: string;
  startsAt: string;
}

/**
 * Previous-editions picker: top-3 title-similarity suggestions plus a
 * search box over the organizer's full past-event list. Emits one
 * `linkedPastEventIds` checkbox per selected event.
 */
export function PastEditionsPicker({
  events,
  eventTitle,
  defaultLinkedIds = [],
  disabled = false,
}: {
  events: PastEvent[];
  eventTitle: string;
  defaultLinkedIds?: string[];
  disabled?: boolean;
}) {
  const [linkedIds, setLinkedIds] = useState<string[]>(defaultLinkedIds);
  const [search, setSearch] = useState("");

  const suggestions = useMemo(() => {
    const tokens = eventTitle.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    if (tokens.length === 0) return events.slice(0, 3);
    return events
      .map((pe) => ({
        pe,
        score: tokens.reduce((s, t) => s + (pe.title.toLowerCase().includes(t) ? 1 : 0), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.pe);
  }, [eventTitle, events]);

  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      const ids = new Set(suggestions.map((s) => s.id));
      const extra = events.filter((pe) => linkedIds.includes(pe.id) && !ids.has(pe.id));
      return [...suggestions, ...extra];
    }
    return events.filter((pe) => pe.title.toLowerCase().includes(q)).slice(0, 10);
  }, [search, suggestions, events, linkedIds]);

  function toggle(id: string) {
    setLinkedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (events.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
      <p className="text-sm font-bold">Link Previous Editions</p>
      <p className="mt-1 text-xs text-muted">
        Select your past events that are previous editions of this one. Their ratings will show on this event page.
      </p>
      {!disabled ? (
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your past events…"
            className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5"
          />
        </div>
      ) : null}
      <div className="mt-2 space-y-1.5">
        {visibleEvents.length === 0 ? (
          <p className="text-xs text-muted">No past events match.</p>
        ) : (
          visibleEvents.map((pe) => (
            <label
              key={pe.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                linkedIds.includes(pe.id)
                  ? "border-violet-neon bg-violet-neon/10"
                  : "border-zinc-200 dark:border-white/10",
                disabled && "pointer-events-none opacity-70",
              )}
            >
              <input
                type="checkbox"
                name="linkedPastEventIds"
                value={pe.id}
                checked={linkedIds.includes(pe.id)}
                onChange={() => toggle(pe.id)}
                disabled={disabled}
                className="h-3.5 w-3.5 accent-violet-neon"
              />
              <span className="min-w-0 flex-1 truncate">{pe.title}</span>
              <span className="shrink-0 text-xs text-muted">
                {new Date(pe.startsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              {!search.trim() && suggestions.some((s) => s.id === pe.id) ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-neon">
                  Suggested
                </span>
              ) : null}
            </label>
          ))
        )}
      </div>
      {disabled
        ? linkedIds.map((id) => (
            <input key={id} type="hidden" name="linkedPastEventIds" value={id} />
          ))
        : null}
    </div>
  );
}
