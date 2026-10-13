import { EventCard } from "./event-card";
import type { EventSummary } from "@/modules/shared";

export function EventSection({
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
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
        {events.map((event) => (
          <div key={event.id} className="w-44 shrink-0 sm:w-52">
            <EventCard event={event} />
          </div>
        ))}
      </div>
    </section>
  );
}
