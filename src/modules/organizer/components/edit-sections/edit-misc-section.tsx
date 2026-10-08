"use client";

import { useActionState, useEffect, useState } from "react";
import { CollapsibleSection, cn } from "@/modules/shared";
import { updateEventSectionAction, type UpdateEventSectionState } from "../../actions/events";
import { PastEditionsPicker } from "../past-editions-picker";
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
  const linkedIds = event.linkedPastEventIds ?? [];
  // Bump to remount the picker and discard unsaved checkbox changes on cancel.
  const [pickerKey, setPickerKey] = useState(0);

  useEffect(() => {
    if (state.saved === "misc") setIsEditing(false);
  }, [state.saved]);

  function handleCancel() {
    setWaitlistEnabled(event.waitlistEnabled);
    setAllowBookingDuringEvent(event.allowBookingDuringEvent);
    setPickerKey((k) => k + 1);
    setIsEditing(false);
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
          <PastEditionsPicker
            key={pickerKey}
            events={pastEvents}
            eventTitle={event.title}
            defaultLinkedIds={linkedIds}
            disabled={!isEditing}
          />
        ) : null}

        {/* Post flag values even in read mode so a save doesn't clear them.
            linkedPastEventIds hidden inputs are emitted by the picker itself. */}
        {!isEditing ? (
          <>
            <input type="hidden" name="waitlistEnabled" value={waitlistEnabled ? "on" : ""} />
            <input type="hidden" name="allowBookingDuringEvent" value={allowBookingDuringEvent ? "on" : ""} />
          </>
        ) : null}
      </form>
    </CollapsibleSection>
  );
}
