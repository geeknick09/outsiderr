import { isEventEnded } from "@/modules/shared";
import type { EventSummary } from "@/modules/shared";

export function partitionSearchEvents(events: EventSummary[]): {
  upcoming: EventSummary[];
  past: EventSummary[];
} {
  // An event counts as "past" the moment it ends (time-aware, not day-aware) —
  // a 6–9am run shows under Past Events at noon, not still "Happening Today".
  return {
    upcoming: events
      .filter((event) => !isEventEnded(event.startsAt, event.endsAt))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    past: events
      .filter((event) => isEventEnded(event.startsAt, event.endsAt))
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
  };
}
