import Link from "next/link";
import { redirect } from "next/navigation";
import { ScanLine } from "lucide-react";

import { EventForm } from "@/components/organizer/event-form";
import { VerificationQueue } from "@/components/organizer/verification-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listPendingOrders } from "@/lib/data/orders";
import { listOrganizerEvents } from "@/lib/data/organizer";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Organizer — Outsiderr" };

export default async function OrganizerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const tab = (await searchParams).tab === "verify" ? "verify" : "create";
  const [events, pending] = await Promise.all([
    listOrganizerEvents(user),
    listPendingOrders(),
  ]);

  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Organizer</h1>
          <p className="text-sm text-muted">Publish events and verify UPI payments.</p>
        </div>
        <Link href="/organizer/scan">
          <Button variant="secondary">
            <ScanLine className="h-4 w-4" />
            Door scanner
          </Button>
        </Link>
      </div>

      <div className="flex gap-2">
        <TabLink href="/organizer" label="Create event" active={tab === "create"} />
        <TabLink
          href="/organizer?tab=verify"
          label={`Verification queue${pending.length ? ` (${pending.length})` : ""}`}
          active={tab === "verify"}
        />
      </div>

      {tab === "create" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <EventForm />
          <aside className="glass h-fit space-y-3 rounded-3xl p-5">
            <h2 className="text-base font-bold">Your events</h2>
            {events.length === 0 ? (
              <p className="text-sm text-muted">No events yet.</p>
            ) : (
              events.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="block rounded-2xl border border-zinc-200 p-3 text-sm transition-colors hover:border-violet-neon dark:border-white/10"
                >
                  <span className="block font-semibold">{event.title}</span>
                  <span className="block text-xs text-muted">
                    {formatDateTime(event.startsAt)}
                  </span>
                  <Badge tone="neutral" className="mt-2">
                    {event.registrationsCount} registered
                  </Badge>
                </Link>
              ))
            )}
          </aside>
        </div>
      ) : (
        <VerificationQueue orders={pending} />
      )}
    </div>
  );
}

function TabLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-neon-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow-violet"
          : "rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-muted hover:border-violet-neon dark:border-white/10"
      }
    >
      {label}
    </Link>
  );
}
