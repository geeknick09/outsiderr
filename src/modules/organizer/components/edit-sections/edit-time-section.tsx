"use client";

import { useState } from "react";
import { CollapsibleSection } from "@/modules/shared";
import { utcToISTInput } from "@/modules/shared";

interface EditTimeSectionProps {
  event: {
    startsAt: string;
    endsAt: string | null;
  };
  lockLogistics?: boolean;
  onSave: () => void;
}

export function EditTimeSection({ event, lockLogistics, onSave }: EditTimeSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [startsAt, setStartsAt] = useState(utcToISTInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(event.endsAt ? utcToISTInput(event.endsAt) : "");
  const [dateError, setDateError] = useState<string | null>(null);

  function validateDates(start: string, end: string) {
    const parseIST = (s: string) => new Date(/[Z+-]/.test(s.slice(-6)) ? s : `${s}+05:30`);
    if (end && start && parseIST(end) <= parseIST(start)) {
      setDateError("End date and time must be after the start date and time.");
    } else {
      setDateError(null);
    }
  }

  function handleSave() {
    if (dateError) return;
    setIsEditing(false);
    onSave();
  }

  function handleCancel() {
    setStartsAt(utcToISTInput(event.startsAt));
    setEndsAt(event.endsAt ? utcToISTInput(event.endsAt) : "");
    setDateError(null);
    setIsEditing(false);
  }

  return (
    <CollapsibleSection
      id="event-schedule"
      title="Event Time"
      defaultOpen={false}
      onEdit={() => setIsEditing(true)}
      isEditing={isEditing}
      onCancel={handleCancel}
      onSave={handleSave}
      disabled={lockLogistics}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5">Starts at</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => {
              setStartsAt(e.target.value);
              validateDates(e.target.value, endsAt);
            }}
            disabled={!isEditing}
            className="w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5">Ends at</label>
          <input
            type="datetime-local"
            value={endsAt}
            min={startsAt}
            onChange={(e) => {
              setEndsAt(e.target.value);
              validateDates(startsAt, e.target.value);
            }}
            disabled={!isEditing}
            className="w-full min-w-0 box-border rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon [color-scheme:light] dark:[color-scheme:dark] dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50"
          />
        </div>
      </div>
      {dateError ? <p className="text-sm text-red-500">{dateError}</p> : null}
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="endsAt" value={endsAt} />
    </CollapsibleSection>
  );
}
