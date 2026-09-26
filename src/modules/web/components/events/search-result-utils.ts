import { isPast } from "@/modules/shared";
import type { EventSummary } from "@/modules/shared";

export function partitionSearchEvents(events: EventSummary[]): {
  upcoming: EventSummary[];
  past: EventSummary[];
} {
  return {
    upcoming: events
      .filter((event) => !isPast(event.startsAt))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    past: events
      .filter((event) => isPast(event.startsAt))
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
  };
}
