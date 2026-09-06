"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime, isPast } from "@/lib/format";
import type { EventAnalytics, EventSummary } from "@/lib/types";

type SortKey = "date" | "title" | "popularity" | "waitlist" | "revenue";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Latest events" },
  { value: "title", label: "Alphabetical" },
  { value: "popularity", label: "Popularity" },
  { value: "waitlist", label: "Waitlist" },
  { value: "revenue", label: "Revenue" },
];

/** Check if an event is currently happening (between startsAt and endsAt). */
function isHappeningNow(startsAt: string, endsAt: string | null | undefined): boolean {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start + 2 * 60 * 60 * 1000; // default 2h
  return now >= start && now <= end;
}

function getStatusBadge(event: EventSummary) {
  const past = isPast(event.startsAt);
  if (past) return { tone: "neutral" as const, label: "Completed" };
  if (event.status === "PUBLISHED") {
    if (isHappeningNow(event.startsAt, event.endsAt)) {
      return { tone: "success" as const, label: "Live" };
    }
    return { tone: "success" as const, label: "Published" };
  }
  if (event.status === "CANCELLED") return { tone: "danger" as const, label: "Cancelled" };
  if (event.status === "CANCELLATION_REQUESTED") return { tone: "danger" as const, label: "Cancelling…" };
  if (event.status === "POSTPONED") return { tone: "violet" as const, label: "Postponed" };
  if (event.status === "DRAFT") return { tone: "neutral" as const, label: "Draft" };
  return { tone: "neutral" as const, label: "Draft" };
}

/** Classify an event into a lifecycle tab. */
type LifecycleTab = "published" | "drafts" | "completed" | "cancelled";

function classifyEvent(event: EventSummary): LifecycleTab {
  if (event.status === "DRAFT") return "drafts";
  if (event.status === "CANCELLED" || event.status === "CANCELLATION_REQUESTED") return "cancelled";
  if (event.status === "POSTPONED") return "published"; // postponed stays in published
  // PUBLISHED
  const past = isPast(event.startsAt);
  if (past) return "completed";
  return "published";
}

const TAB_LABELS: Record<LifecycleTab, string> = {
  published: "Published",
  drafts: "Drafts",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function OrganizerEventsList({
  events,
  analyticsMap = {},
}: {
  events: EventSummary[];
  analyticsMap?: Record<string, EventAnalytics>;
}) {
  const [activeTab, setActiveTab] = useState<LifecycleTab>("published");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Group events by lifecycle tab
  const grouped: Record<LifecycleTab, EventSummary[]> = {
    published: [],
    drafts: [],
    completed: [],
    cancelled: [],
  };
  for (const event of events) {
    const tab = classifyEvent(event);
    grouped[tab].push(event);
  }

  const tabEvents = grouped[activeTab];

  const sorted = [...tabEvents].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "popularity":
        cmp = a.registrationsCount - b.registrationsCount;
        break;
      case "waitlist":
        cmp = (analyticsMap[a.id]?.waitlistCount ?? 0) - (analyticsMap[b.id]?.waitlistCount ?? 0);
        break;
      case "revenue":
        cmp = (analyticsMap[a.id]?.grossRevenuePaise ?? 0) - (analyticsMap[b.id]?.grossRevenuePaise ?? 0);
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
      {/* Lifecycle tabs */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TAB_LABELS) as LifecycleTab[]).map((tab) => {
          const count = grouped[tab].length;
          if (count === 0 && tab !== "published") return null; // hide empty tabs except published
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={
                activeTab === tab
                  ? "rounded-full bg-neon-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow-violet"
                  : "rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-muted hover:border-violet-neon dark:border-white/10"
              }
            >
              {TAB_LABELS[tab]}{count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {/* Sort controls */}
      {tabEvents.length > 0 ? (
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

      {tabEvents.length === 0 ? (
        <p className="glass rounded-3xl p-5 text-sm text-muted">
          {activeTab === "published" ? (
            <>
              No published events yet.{" "}
              <Link href="/organizer?tab=create" className="underline hover:text-violet-neon">
                Create your first event
              </Link>
              .
            </>
          ) : activeTab === "drafts" ? (
            <>No draft events. Save an event as draft to continue later.</>
          ) : activeTab === "completed" ? (
            <>No completed events yet.</>
          ) : (
            <>No cancelled events.</>
          )}
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
                {event.status !== "DRAFT" ? (
                  <Badge tone="neutral">{event.registrationsCount} registered</Badge>
                ) : null}
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}
