import { PastEventCard } from "@/components/events/past-event-card";
import type { EventSummary } from "@/lib/types";

export function PastEventSection({
  title,
  subtitle,
  events,
}: {
  title: string;
  subtitle?: string;
  events: EventSummary[];
}) {
  if (events.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="mb-3">
        <h2 className="text-xl font-black tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {events.map((event) => (
          <PastEventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
