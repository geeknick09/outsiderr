"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import { Badge } from "@/modules/shared";
import { formatDateTime, isEventEnded } from "@/modules/shared";
import type { EventAnalytics, EventSummary } from "@/modules/shared";

type SortKey = "date" | "title" | "popularity" | "waitlist" | "revenue";
type EventRow = EventSummary & { collaboratorPermission?: string };

const PAGE_SIZE = 10;

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
  const past = isEventEnded(event.startsAt, event.endsAt);
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
  const past = isEventEnded(event.startsAt, event.endsAt);
  if (past) return "completed";
  return "published";
}

const TAB_LABELS: Record<LifecycleTab, string> = {
  published: "Published",
  drafts: "Drafts",
  completed: "Completed",
  cancelled: "Cancelled",
};

function EventListRow({ event }: { event: EventRow }) {
  const status = getStatusBadge(event);
  return (
    <Link
      href={`/organizer/events/${event.id}`}
      className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4 transition-colors hover:border-violet-neon/50"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold">{event.title}</p>
        <p className="text-xs text-muted">{formatDateTime(event.startsAt)}</p>
      </div>
      <div className="flex items-center gap-2">
        {event.collaboratorPermission ? (
          <Badge tone="violet">
            Co-organizer · {({ LIMITED: "Ops", ANALYTICS: "Ops + Money", FULL: "Full" } as Record<string, string>)[event.collaboratorPermission] ?? event.collaboratorPermission}
          </Badge>
        ) : null}
        {event.status !== "DRAFT" ? (
          <Badge tone="neutral">{event.registrationsCount} registered</Badge>
        ) : null}
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
    </Link>
  );
}

function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        className="rounded-full border border-zinc-200 p-1.5 text-muted hover:border-violet-neon disabled:opacity-40 dark:border-white/10"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-xs font-semibold text-muted">
        Page {page + 1} of {pageCount}
      </span>
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pageCount - 1}
        className="rounded-full border border-zinc-200 p-1.5 text-muted hover:border-violet-neon disabled:opacity-40 dark:border-white/10"
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function OrganizerEventsList({
  events,
  analyticsMap = {},
}: {
  events: EventRow[];
  analyticsMap?: Record<string, EventAnalytics>;
}) {
  const [activeTab, setActiveTab] = useState<LifecycleTab>("published");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // Group events by lifecycle tab
  const grouped = useMemo(() => {
    const g: Record<LifecycleTab, EventRow[]> = {
      published: [],
      drafts: [],
      completed: [],
      cancelled: [],
    };
    for (const event of events) {
      g[classifyEvent(event)].push(event);
    }
    return g;
  }, [events]);

  // Search runs across ALL events regardless of lifecycle tab.
  const visible = useMemo(() => {
    const base = searching ? events : grouped[activeTab];
    if (!searching) return base;
    return base.filter((e) => e.title.toLowerCase().includes(q));
  }, [searching, events, grouped, activeTab, q]);

  const sorted = useMemo(() => {
    return [...visible].sort((a, b) => {
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
  }, [visible, sortKey, sortAsc, analyticsMap]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function toggleSort() {
    setSortAsc((v) => !v);
  }

  return (
    <div className="space-y-3">
      {/* Universal search - across published, drafts, completed and cancelled */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search your events - any state…"
          className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-9 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-zinc-900"
        />
        {searching ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setPage(0);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Lifecycle tabs - hidden while searching (search covers every state) */}
      {!searching ? (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TAB_LABELS) as LifecycleTab[]).map((tab) => {
            const count = grouped[tab].length;
            if (count === 0 && tab !== "published") return null; // hide empty tabs except published
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setPage(0);
                }}
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
      ) : (
        <p className="text-xs font-semibold text-muted">
          {sorted.length} result{sorted.length === 1 ? "" : "s"} for “{query.trim()}”
        </p>
      )}

      {/* Sort controls */}
      {visible.length > 0 ? (
        <div className="flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4 text-muted" />
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey);
              setPage(0);
            }}
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

      {visible.length === 0 ? (
        <p className="glass rounded-3xl p-5 text-sm text-muted">
          {searching ? (
            <>No events match “{query.trim()}”.</>
          ) : activeTab === "published" ? (
            <>
              Nothing live yet.{" "}
              <Link href="/organizer?tab=create" className="underline hover:text-violet-neon">
                Put an event out
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
        <>
          {paged.map((event) => (
            <EventListRow key={event.id} event={event} />
          ))}
          <Pagination page={safePage} pageCount={pageCount} onPage={setPage} />
        </>
      )}
    </div>
  );
}
