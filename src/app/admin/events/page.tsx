import Link from "next/link";

import {
  adminDeleteEventAction,
  adminToggleFeaturedAction,
  adminUpdateEventStatusAction,
  adminUpdateEventFeesAction,
} from "@/actions/admin";
import { AdminEventEditForm } from "@/components/admin/admin-event-edit-form";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/submit-button";
import { listAllAdminEvents } from "@/lib/data/admin";
import { CATEGORY_LABELS, CITY_LABELS } from "@/lib/constants";
import { formatDateTime, isPast } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventCategory, City } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Events — Outsiderr" };

/** Check if an event is currently happening (between startsAt and endsAt). */
function isHappeningNow(startsAt: string, endsAt: string | null | undefined): boolean {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start + 2 * 60 * 60 * 1000;
  return now >= start && now <= end;
}

/** Get a human-friendly status label with Live/Published distinction. */
function getStatusLabel(status: string, startsAt: string, endsAt: string | null | undefined): string {
  if (status === "PUBLISHED") {
    if (isPast(startsAt)) return "Completed";
    if (isHappeningNow(startsAt, endsAt)) return "Live";
    return "Published";
  }
  return status.replace(/_/g, " ");
}

function getStatusTone(status: string, startsAt: string, endsAt: string | null | undefined): "success" | "danger" | "neutral" | "violet" {
  if (status === "PUBLISHED") {
    if (isPast(startsAt)) return "neutral";
    return "success";
  }
  if (status === "CANCELLED") return "danger";
  if (status === "POSTPONED") return "violet";
  return "neutral";
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; city?: string; category?: string }>;
}) {
  const params = await searchParams;
  const events = await listAllAdminEvents({
    search: params.search,
    status: params.status as "all" | undefined,
    city: params.city as "all" | undefined,
    category: params.category as "all" | undefined,
  });

  const statuses = ["all", "DRAFT", "PUBLISHED", "CANCELLATION_REQUESTED", "CANCELLED", "POSTPONED"];
  const cities = ["all", ...Object.keys(CITY_LABELS)];
  const categories = ["all", ...Object.keys(CATEGORY_LABELS)];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Events</h1>
        <p className="text-sm text-muted">{events.length} shown</p>
      </div>

      {/* Search + Filters */}
      <form className="flex flex-wrap gap-2" method="GET">
        <input
          name="search"
          defaultValue={params.search ?? ""}
          placeholder="Search by title…"
          className="min-w-[200px] flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
        <select name="status" defaultValue={params.status ?? "all"} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
          {statuses.map((s) => <option key={s} value={s}>{s === "all" ? "All Status" : s.replace(/_/g, " ")}</option>)}
        </select>
        <select name="city" defaultValue={params.city ?? "all"} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
          {cities.map((c) => <option key={c} value={c}>{c === "all" ? "All Cities" : CITY_LABELS[c as City] ?? c}</option>)}
        </select>
        <select name="category" defaultValue={params.category ?? "all"} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
          {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All Categories" : CATEGORY_LABELS[c as EventCategory] ?? c}</option>)}
        </select>
        <button type="submit" className="rounded-2xl bg-neon-gradient px-4 py-2 text-sm font-bold text-white">
          Filter
        </button>
      </form>

      <div className="space-y-2">
        {events.map((event) => {
          const statusLabel = getStatusLabel(event.status, event.startsAt, event.endsAt);
          const statusTone = getStatusTone(event.status, event.startsAt, event.endsAt);
          return (
          <div key={event.id} className="glass space-y-3 rounded-3xl p-4">
            <div className="flex flex-wrap items-center gap-3">
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
                <Badge tone={statusTone}>
                  {statusLabel}
                </Badge>
                {event.isFeatured ? <Badge tone="lime">Featured</Badge> : null}
                {event.pricingMode === "PHASED" ? <Badge tone="violet">Phased</Badge> : null}

                {event.status === "PUBLISHED" ? (
                  <form>
                    <ActionButton
                      formAction={async () => {
                        "use server";
                        await adminToggleFeaturedAction(event.id, !event.isFeatured);
                      }}
                      loadingText="…"
                      className={cn(
                        "border px-2.5 py-1",
                        event.isFeatured
                          ? "border-amber-400/50 text-amber-600 hover:border-amber-400"
                          : "border-zinc-200 text-muted hover:border-lime-400 hover:text-lime-600 dark:border-white/10",
                      )}
                    >
                      {event.isFeatured ? "Unfeature" : "Feature"}
                    </ActionButton>
                  </form>
                ) : null}

                {event.status === "PUBLISHED" ? (
                  <form>
                    <ActionButton
                      formAction={async () => {
                        "use server";
                        await adminUpdateEventStatusAction(event.id, "CANCELLED");
                      }}
                      loadingText="…"
                      className="border-zinc-200 text-muted hover:border-red-400 hover:text-red-500 dark:border-white/10"
                    >
                      Cancel
                    </ActionButton>
                  </form>
                ) : event.status === "CANCELLED" ? (
                  <form>
                    <ActionButton
                      formAction={async () => {
                        "use server";
                        await adminUpdateEventStatusAction(event.id, "PUBLISHED");
                      }}
                      loadingText="…"
                      className="border-zinc-200 text-muted hover:border-lime-400 hover:text-lime-600 dark:border-white/10"
                    >
                      Re-publish
                    </ActionButton>
                  </form>
                ) : event.status === "DRAFT" ? (
                  <form>
                    <ActionButton
                      formAction={async () => {
                        "use server";
                        await adminUpdateEventStatusAction(event.id, "PUBLISHED");
                      }}
                      loadingText="…"
                      className="border-zinc-200 text-muted hover:border-lime-400 hover:text-lime-600 dark:border-white/10"
                    >
                      Publish
                    </ActionButton>
                  </form>
                ) : null}

                <form>
                  <ActionButton
                    formAction={async () => {
                      "use server";
                      await adminDeleteEventAction(event.id);
                    }}
                    loadingText="…"
                    className="border-zinc-200 text-muted hover:border-red-400 hover:text-red-500 dark:border-white/10"
                  >
                    Delete
                  </ActionButton>
                </form>
              </div>
            </div>

            {/* Inline edit form */}
            <AdminEventEditForm
              eventId={event.id}
              title={event.title}
              description={event.description}
              category={event.category}
              city={event.city}
              venueName={event.venueName}
              venueAddress={event.venueAddress}
              startsAt={event.startsAt}
              endsAt={event.endsAt}
            />

            {/* Commission + convenience fee controls */}
            {event.pricingMode !== "FREE" ? (
              <form action={async (formData: FormData) => {
                "use server";
                await adminUpdateEventFeesAction(event.id, {
                  commissionBps: Number(formData.get("commissionBps") ?? 1000),
                  commissionEnabled: formData.get("commissionEnabled") === "on",
                  convenienceFeeBps: Number(formData.get("convenienceFeeBps") ?? 200),
                  convenienceFeeEnabled: formData.get("convenienceFeeEnabled") === "on",
                }, String(formData.get("reason") ?? "").trim() || undefined);
              }} className="flex flex-wrap items-end gap-3 rounded-2xl bg-black/5 p-3 text-xs dark:bg-white/5">
                <label className="space-y-1">
                  <span className="font-semibold text-muted">Commission (%)</span>
                  <input
                    name="commissionBps"
                    type="number"
                    min={0}
                    max={10000}
                    step={100}
                    defaultValue={event.commissionBps / 100}
                    className="w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name="commissionEnabled"
                    defaultChecked={event.commissionEnabled}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-muted">Commission on</span>
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-muted">Convenience fee (%)</span>
                  <input
                    name="convenienceFeeBps"
                    type="number"
                    min={0}
                    max={10000}
                    step={100}
                    defaultValue={event.convenienceFeeBps / 100}
                    className="w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name="convenienceFeeEnabled"
                    defaultChecked={event.convenienceFeeEnabled}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-muted">Convenience fee on</span>
                </label>
                <label className="flex-1 space-y-1">
                  <span className="font-semibold text-muted">Reason (optional)</span>
                  <input
                    name="reason"
                    placeholder="Why are you changing this?"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </label>
                <ActionButton className="border-violet-neon/40 text-violet-neon">
                  Save fees
                </ActionButton>
              </form>
            ) : null}
          </div>
          );
        })}
        {events.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No events found.</p>
        ) : null}
      </div>
    </div>
  );
}
