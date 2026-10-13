"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { Badge } from "@/modules/shared";
import { cityLabel } from "@/modules/shared";

export type TimelineEvent = {
  id: string;
  title: string;
  startsAt: string;
  venueName: string | null;
  city: string | null;
  visibility: string;
};

/** Scrollable event timeline - past events grayed at top, a "Now" divider,
 * upcoming below. Auto-centres the divider on mount. */
export function CommunityTimeline({ events }: { events: TimelineEvent[] }) {
  const nowRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (nowRef.current && boxRef.current) {
      const box = boxRef.current;
      box.scrollTop = nowRef.current.offsetTop - box.offsetHeight / 3;
    }
  }, []);

  const now = Date.now();
  const past = events.filter((e) => new Date(e.startsAt).getTime() < now);
  const upcoming = events.filter((e) => new Date(e.startsAt).getTime() >= now);

  return (
    <div
      ref={boxRef}
      className="max-h-[380px] space-y-0 overflow-y-auto rounded-2xl"
    >
      {past.map((e) => (
        <TimelineRow key={e.id} event={e} past />
      ))}

      {/* "Now" divider */}
      <div ref={nowRef} className="flex items-center gap-3 py-2 pl-[26px]">
        <span className="h-2 w-2 rounded-full bg-violet-neon shadow-glow-violet" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-violet-neon">
          {past.length === 0 ? "Next up" : "Now"}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-violet-neon/50 to-transparent" />
      </div>

      {upcoming.map((e) => (
        <TimelineRow key={e.id} event={e} />
      ))}
    </div>
  );
}

function TimelineRow({ event, past = false }: { event: TimelineEvent; past?: boolean }) {
  const d = new Date(event.startsAt);
  return (
    <Link
      href={`/events/${event.id}`}
      className={`relative flex items-center gap-3 border-l-2 py-2 pl-4 pr-2 transition-all hover:border-violet-neon ${
        past
          ? "border-zinc-300/40 opacity-45 grayscale hover:opacity-75 dark:border-white/10"
          : "border-violet-neon/40"
      }`}
      style={{ marginLeft: "10px" }}
    >
      <span
        className={`absolute -left-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${
          past ? "bg-zinc-400 dark:bg-zinc-600" : "bg-violet-neon"
        }`}
      />
      <div
        className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl ${
          past ? "bg-zinc-200/60 text-muted dark:bg-white/5" : "bg-violet-neon/10 text-violet-neon"
        }`}
      >
        <span className="text-[9px] font-bold uppercase">
          {d.toLocaleString("en-IN", { month: "short" })}
        </span>
        <span className="text-base font-black leading-none">{d.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-bold ${past ? "text-muted" : ""}`}>{event.title}</p>
        <p className="truncate text-xs text-muted">
          {d.toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })}
          {" · "}{event.venueName}{" · "}{cityLabel(event.city)}
        </p>
      </div>
      {event.visibility === "MEMBERS_ONLY" ? <Badge tone="violet">Members</Badge> : null}
      {past ? <span className="text-[10px] uppercase text-muted">Past</span> : null}
    </Link>
  );
}
