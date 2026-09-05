"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime, isPast } from "@/lib/format";
import type { EventSummary } from "@/lib/types";

type SortKey = "date" | "title" | "popularity" | "waitlist" | "revenue";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Latest events" },
  { value: "title", label: "Alphabetical" },
  { value: "popularity", label: "Popularity" },
  { value: "waitlist", label: "Waitlist" },
  { value: "revenue", label: "Revenue" },
];

function getStatusBadge(event: EventSummary) {
  const past = isPast(event.startsAt);
  if (past) return { tone: "neutral" as const, label: "Completed" };
  if (event.status === "PUBLISHED") return { tone: "success" as const, label: "Live" };
  if (event.status === "CANCELLED") return { tone: "danger" as const, label: "Cancelled" };
  if (event.status === "CANCELLATION_REQUESTED") return { tone: "danger" as const, label: "Cancelling…" };
  if (event.status === "POSTPONED") return { tone: "violet" as const, label: "Postponed" };
  if (event.status === "DRAFT") return { tone: "neutral" as const, label: "Draft" };
  return { tone: "neutral" as const, label: "Draft" };
}

export function OrganizerEventsList({ events }: { events: EventSummary[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...events].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "popularity":
        cmp = a.registrationsCount - b.registrationsCount;
        break;
      case "waitlist":
        // No waitlist count in EventSummary — fallback to 0 comparison
        cmp = 0;
        break;
      case "revenue":
        // Revenue proxy: registrations * minPrice
        cmp = a.registrationsCount * a.minPricePaise - b.registrationsCount * b.minPricePaise;
        break;
      case "date":
      default:
        cmp = new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  function toggleSort() {
    setSortAsc((v) => !v);
  }

  return (
    <div className="space-y-3">
      {/* Sort controls */}
      {events.length > 0 ? (
        <div className="flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4 text-muted" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleSort}
            className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-muted hover:border-violet-neon dark:border-white/10"
          >
            {sortAsc ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>
      ) : null}

      {events.length === 0 ? (
        <p className="glass rounded-3xl p-5 text-sm text-muted">
          No events yet.{" "}
          <Link href="/organizer?tab=create" className="underline hover:text-violet-neon">
            Create your first event
          </Link>
          .
        </p>
      ) : (
        sorted.map((event) => {
          const status = getStatusBadge(event);
          return (
            <Link
              key={event.id}
              href={`/organizer/events/${event.id}`}
              className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4 transition-colors hover:border-violet-neon/50"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{event.title}</p>
                <p className="text-xs text-muted">{formatDateTime(event.startsAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{event.registrationsCount} registered</Badge>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}
