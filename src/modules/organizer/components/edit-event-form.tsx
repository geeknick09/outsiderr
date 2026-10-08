"use client";

import {
  EditDetailsSection,
  EditTimeSection,
  EditVenueSection,
  EditTicketsSection,
  EditMediaSection,
  EditInformationSection,
  EditContactSection,
  EditMiscSection,
} from "./edit-sections";
import type { EventDetail } from "@/modules/shared";

export function EditEventForm({ event, pastEvents = [], lockLogistics = false }: { event: EventDetail; pastEvents?: Array<{ id: string; title: string; startsAt: string }>; /** Collaborators: city/venue/date fields are locked — owner only. */ lockLogistics?: boolean }) {
  return (
    <div className="glass space-y-3 rounded-3xl p-5">
      <div>
        <h2 className="text-base font-bold">Manage event details</h2>
        <p className="mt-1 text-xs text-muted">
          Each section saves independently — open it, hit the pencil to edit, save or cancel.
        </p>
      </div>

      {lockLogistics ? (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
          You&apos;re a co-organizer — city, venue and dates are locked. Only the event owner can change them.
        </p>
      ) : null}

      <EditDetailsSection event={event} lockLogistics={lockLogistics} />
      <EditTimeSection event={event} lockLogistics={lockLogistics} />
      <EditVenueSection event={event} lockLogistics={lockLogistics} />
      <EditTicketsSection event={event} lockLogistics={lockLogistics} />
      <EditMediaSection event={event} />
      <EditInformationSection event={event} />
      <EditContactSection event={event} />
      <EditMiscSection event={event} pastEvents={pastEvents} lockLogistics={lockLogistics} />
    </div>
  );
}
