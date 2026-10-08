import { formatDateTime, formatPaise } from "@/modules/shared";
import type { EventDetail } from "@/modules/shared";

/**
 * Read-only event summary - rendered when editing is locked (within 2h of
 * start, cancelled, or past) so the organizer still sees venue, pricing,
 * capacity, and booking settings without being able to mutate them.
 */
export function EventOverview({ event }: { event: EventDetail }) {
  const totalCapacity = event.tiers.reduce((s, t) => s + t.quantity, 0);
  const totalSold = event.tiers.reduce((s, t) => s + t.quantitySold, 0);

  return (
    <div className="glass space-y-5 rounded-3xl p-5">
      <h2 className="text-base font-bold">Event overview</h2>

      <dl className="grid gap-4 sm:grid-cols-2">
        <Row label="City" value={event.city} />
        <Row label="Venue" value={event.venueName === "TBA" ? "TBA - to be announced" : event.venueName} />
        {event.venueName !== "TBA" && event.venueAddress ? (
          <Row label="Address" value={event.venueAddress} className="sm:col-span-2" />
        ) : null}
        <Row label="Starts" value={formatDateTime(event.startsAt)} />
        <Row label="Ends" value={event.endsAt ? formatDateTime(event.endsAt) : "Not set"} />
        <Row label="Max tickets / user" value={String(event.maxTicketsPerUser ?? 5)} />
        <Row label="Capacity" value={`${totalSold} sold / ${totalCapacity} total`} />
        <Row label="Waitlist" value={event.waitlistEnabled ? "Enabled" : "Off"} />
        <Row
          label="Booking during event"
          value={event.allowBookingDuringEvent ? "Allowed" : "Closes at start"}
        />
      </dl>

      {event.tiers.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Ticket tiers</p>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-muted dark:border-white/10">
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Sold</th>
                </tr>
              </thead>
              <tbody>
                {event.tiers.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-100 last:border-0 dark:border-white/5">
                    <td className="px-3 py-2 font-semibold">{t.name}</td>
                    <td className="px-3 py-2">{t.pricePaise === 0 ? "Free" : formatPaise(t.pricePaise)}</td>
                    <td className="px-3 py-2">{t.quantity}</td>
                    <td className="px-3 py-2">{t.quantitySold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {event.tags.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {event.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-muted dark:border-white/10">
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {(event.contactEmail || event.contactPhone) ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          {event.contactEmail ? <Row label="Contact email" value={event.contactEmail} /> : null}
          {event.contactPhone ? <Row label="Contact phone" value={event.contactPhone} /> : null}
        </dl>
      ) : null}
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold">{value}</dd>
    </div>
  );
}
