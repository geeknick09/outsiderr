"use client";

import { useActionState, useEffect, useState } from "react";
import { CollapsibleSection, cn } from "@/modules/shared";
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
            <div className="space-y-1.5">
              {pastEvents.map((pe) => (
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
                </label>
              ))}
            </div>
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
