import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Badge, formatDateTime } from "@/modules/shared";
import { getCurrentUser, getEvent, getEventAccessLevel, canScanTickets } from "@/modules/shared/server";
import { listEventScanLog } from "@/modules/scanner/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Scan log - Outsiderr" };

const TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  VALID: "success",
  ALREADY_USED: "warning",
  DUPLICATE_CONFLICT: "warning",
  WRONG_EVENT: "danger",
  CANCELLED: "danger",
  INVALID: "danger",
};

export default async function EventScanLogPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const { id } = await params;
  const [event, accessLevel] = await Promise.all([getEvent(id), getEventAccessLevel(user, id)]);
  if (!event || !accessLevel || !canScanTickets(accessLevel)) notFound();

  const rows = await listEventScanLog(id);

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <Link href={`/organizer/events/${id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-violet-neon">
        <ChevronLeft className="h-4 w-4" /> Back to event
      </Link>
      <div>
        <h1 className="text-2xl font-black">Scan log</h1>
        <p className="text-sm text-muted">{event.title} · every door scan, newest first</p>
      </div>
      {rows.length === 0 ? (
        <p className="glass rounded-3xl p-5 text-sm text-muted">No scans yet.</p>
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-zinc-200 dark:border-white/10">
              <tr>
                <th className="px-3 py-2 font-semibold text-muted">Time</th>
                <th className="px-3 py-2 font-semibold text-muted">Result</th>
                <th className="px-3 py-2 font-semibold text-muted">Door staff</th>
                <th className="hidden px-3 py-2 font-semibold text-muted sm:table-cell">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-white/5">
                  <td className="px-3 py-2 font-mono">{formatDateTime(r.scannedAt)}</td>
                  <td className="px-3 py-2"><Badge tone={TONE[r.outcome] ?? "neutral"}>{r.outcome.replace(/_/g, " ")}</Badge></td>
                  <td className="px-3 py-2">{r.actorName ?? "-"}</td>
                  <td className="hidden px-3 py-2 text-muted sm:table-cell">{r.source === "OFFLINE_SYNC" ? "Offline, synced" : "Live"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
