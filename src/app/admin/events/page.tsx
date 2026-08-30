import Link from "next/link";

import {
  adminDeleteEventAction,
  adminUpdateEventStatusAction,
} from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { listAllAdminEvents } from "@/lib/data/admin";
import { CATEGORY_LABELS, CITY_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Events — Outsiderr" };

export default async function AdminEventsPage() {
  const events = await listAllAdminEvents();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Events</h1>
        <p className="text-sm text-muted">{events.length} total</p>
      </div>

      <div className="space-y-2">
        {events.map((event) => (
          <div key={event.id} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
            <div className="min-w-0 flex-1">
              <Link
                href={`/events/${event.id}`}
                target="_blank"
                className="block truncate font-semibold hover:text-violet-neon"
              >
                {event.title} ↗
              </Link>
              <p className="text-xs text-muted">
                {event.organizerName} · {CATEGORY_LABELS[event.category]} · {CITY_LABELS[event.city]} · {formatDateTime(event.startsAt)}
              </p>
              <p className="text-xs text-muted">{event.registrationsCount} registrations</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  event.status === "PUBLISHED" ? "success" : event.status === "CANCELLED" ? "danger" : "neutral"
                }
              >
                {event.status}
              </Badge>
              {event.isFeatured ? <Badge tone="lime">Boosted</Badge> : null}

              {event.status === "PUBLISHED" ? (
                <form>
                  <input type="hidden" name="eventId" value={event.id} />
                  <button
                    formAction={async () => {
                      "use server";
                      await adminUpdateEventStatusAction(event.id, "CANCELLED");
                    }}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-muted hover:border-red-400 hover:text-red-500 dark:border-white/10"
                  >
                    Cancel
                  </button>
                </form>
              ) : event.status === "CANCELLED" ? (
                <form>
                  <button
                    formAction={async () => {
                      "use server";
                      await adminUpdateEventStatusAction(event.id, "PUBLISHED");
                    }}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-muted hover:border-lime-400 hover:text-lime-600 dark:border-white/10"
                  >
                    Re-publish
                  </button>
                </form>
              ) : null}

              <form>
                <button
                  formAction={async () => {
                    "use server";
                    await adminDeleteEventAction(event.id);
                  }}
                  className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-muted hover:border-red-400 hover:text-red-500 dark:border-white/10"
                >
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
