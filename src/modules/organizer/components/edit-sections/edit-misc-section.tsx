"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CollapsibleSection, cn } from "@/modules/shared";
import { Search } from "lucide-react";
import { updateEventSectionAction, type UpdateEventSectionState } from "../../actions/events";
import type { EventDetail } from "@/modules/shared";

interface EditMiscSectionProps {
  event: EventDetail;
  pastEvents: Array<{ id: string; title: string; startsAt: string }>;
  lockLogistics?: boolean;
}

export function EditMiscSection({ event, pastEvents, lockLogistics = false }: EditMiscSectionProps) {
  const [state, formAction, pending] = useActionState<UpdateEventSectionState, FormData>(
    updateEventSectionAction,
    { error: null },
  );
  const [isEditing, setIsEditing] = useState(false);
  const [waitlistEnabled, setWaitlistEnabled] = useState(event.waitlistEnabled);
  const [allowBookingDuringEvent, setAllowBookingDuringEvent] = useState(event.allowBookingDuringEvent);
  const [linkedIds, setLinkedIds] = useState<string[]>(event.linkedPastEventIds ?? []);
  const [search, setSearch] = useState("");

  // Smart default: rank the organizer's past events by title similarity to
  // this event's title, surface the top 3 as suggestions.
  const suggestions = useMemo(() => {
    const tokens = event.title.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    if (tokens.length === 0) return pastEvents.slice(0, 3);
    return pastEvents
      .map((pe) => ({
        pe,
        score: tokens.reduce((s, t) => s + (pe.title.toLowerCase().includes(t) ? 1 : 0), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.pe);
  }, [event.title, pastEvents]);

  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      // Suggestions + anything already linked (don't hide a linked item).
      const ids = new Set(suggestions.map((s) => s.id));
      const extra = pastEvents.filter((pe) => linkedIds.includes(pe.id) && !ids.has(pe.id));
      return [...suggestions, ...extra];
    }
    return pastEvents.filter((pe) => pe.title.toLowerCase().includes(q)).slice(0, 10);
  }, [search, suggestions, pastEvents, linkedIds]);

  useEffect(() => {
    if (state.saved === "misc") setIsEditing(false);
  }, [state.saved]);

  function handleCancel() {
    setWaitlistEnabled(event.waitlistEnabled);
    setAllowBookingDuringEvent(event.allowBookingDuringEvent);
    setLinkedIds(event.linkedPastEventIds ?? []);
    setIsEditing(false);
  }

  function toggleLinked(id: string) {
    setLinkedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <CollapsibleSection
      title="Options & Links"
      description="Waitlist, booking-during-event, and linked past editions."
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      formId="sec-misc"
      pending={pending}
      disabled={lockLogistics}
      error={state.error}
      saved={state.saved === "misc"}
    >
      <form id="sec-misc" action={formAction} className="space-y-4">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="section" value="misc" />

        <label className={cn("flex items-center gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-white/10", !isEditing && "opacity-70")}>
          <input
            type="checkbox"
            name="waitlistEnabled"
            checked={waitlistEnabled}
            onChange={(e) => setWaitlistEnabled(e.target.checked)}
            disabled={!isEditing}
            className="h-4 w-4 accent-violet-neon"
          />
          <span>
            <span className="block text-sm font-semibold">Enable waitlist</span>
            <span className="block text-xs text-muted">Sold-out tiers offer a waitlist spot instead of a dead end.</span>
          </span>
        </label>

        <label className={cn("flex items-center gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-white/10", !isEditing && "opacity-70")}>
          <input
            type="checkbox"
            name="allowBookingDuringEvent"
            checked={allowBookingDuringEvent}
            onChange={(e) => setAllowBookingDuringEvent(e.target.checked)}
            disabled={!isEditing}
            className="h-4 w-4 accent-violet-neon"
          />
          <span>
            <span className="block text-sm font-semibold">Allow booking during event</span>
            <span className="block text-xs text-muted">Keep sales open after the event has started.</span>
          </span>
        </label>

        {pastEvents.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">Link past editions</p>
            {isEditing ? (
              <div className="relative mb-2">
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
            {visibleEvents.length === 0 ? (
              <p className="text-xs text-muted">No past events match.</p>
            ) : (
              <div className="space-y-1.5">
                {visibleEvents.map((pe) => (
                  <label
                    key={pe.id}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                      linkedIds.includes(pe.id)
                        ? "border-violet-neon bg-violet-neon/10"
                        : "border-zinc-200 dark:border-white/10",
                      !isEditing && "pointer-events-none opacity-70",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="linkedPastEventIds"
                      value={pe.id}
                      checked={linkedIds.includes(pe.id)}
                      onChange={() => toggleLinked(pe.id)}
                      disabled={!isEditing}
                      className="h-3.5 w-3.5 accent-violet-neon"
                    />
                    {pe.title}
                    {!search.trim() && suggestions.some((s) => s.id === pe.id) ? (
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-violet-neon">
                        Suggested
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Post values even in read mode so a save of another field doesn't clear flags */}
        {!isEditing ? (
          <>
            <input type="hidden" name="waitlistEnabled" value={waitlistEnabled ? "on" : ""} />
            <input type="hidden" name="allowBookingDuringEvent" value={allowBookingDuringEvent ? "on" : ""} />
            {linkedIds.map((id) => (
              <input key={id} type="hidden" name="linkedPastEventIds" value={id} />
            ))}
          </>
        ) : null}
      </form>
    </CollapsibleSection>
  );
}
