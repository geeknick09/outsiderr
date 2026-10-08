"use client";

import { useActionState, useEffect, useState } from "react";
import { CollapsibleSection, utcToISTInput } from "@/modules/shared";
import { updateEventSectionAction, type UpdateEventSectionState } from "../../actions/events";
import type { EventDetail } from "@/modules/shared";

const INPUT =
  "w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50";

export function EditTimeSection({ event, lockLogistics = false }: { event: EventDetail; lockLogistics?: boolean }) {
  const [state, formAction, pending] = useActionState<UpdateEventSectionState, FormData>(
    updateEventSectionAction,
    { error: null },
  );
  const [isEditing, setIsEditing] = useState(false);
  const [startsAt, setStartsAt] = useState(utcToISTInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(event.endsAt ? utcToISTInput(event.endsAt) : "");
  const [dateError, setDateError] = useState<string | null>(null);

  useEffect(() => {
    if (state.saved === "schedule") setIsEditing(false);
  }, [state.saved]);

  function validateDates(start: string, end: string) {
    const parseIST = (s: string) => new Date(/[Z+-]/.test(s.slice(-6)) ? s : `${s}+05:30`);
    if (end && start && parseIST(end) <= parseIST(start)) {
      setDateError("End date and time must be after the start date and time.");
    } else {
      setDateError(null);
    }
  }

  function handleCancel() {
    setStartsAt(utcToISTInput(event.startsAt));
    setEndsAt(event.endsAt ? utcToISTInput(event.endsAt) : "");
    setDateError(null);
    setIsEditing(false);
  }

  return (
    <CollapsibleSection
      title="Event Time"
      description="Start and end date/time (IST)."
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      formId="sec-schedule"
      pending={pending}
      disabled={lockLogistics}
      error={state.error ?? dateError}
      saved={state.saved === "schedule"}
    >
      <form id="sec-schedule" action={formAction} className="space-y-4">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="section" value="schedule" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Starts at</label>
            <input
              type="datetime-local"
              name="startsAt"
              value={startsAt}
              onChange={(e) => {
                setStartsAt(e.target.value);
                validateDates(e.target.value, endsAt);
              }}
              readOnly={!isEditing}
              required
              className={INPUT}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Ends at</label>
            <input
              type="datetime-local"
              name="endsAt"
              value={endsAt}
              min={startsAt}
              onChange={(e) => {
                setEndsAt(e.target.value);
                validateDates(startsAt, e.target.value);
              }}
              readOnly={!isEditing}
              required
              className={INPUT}
            />
          </div>
        </div>
      </form>
    </CollapsibleSection>
  );
}
