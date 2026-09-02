import Link from "next/link";

import { HeroBoostAdminActions } from "@/components/admin/hero-boost-admin-actions";
import { Badge } from "@/components/ui/badge";
import { listAllHeroBoosts } from "@/lib/data/hero-boosts";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminHeroBoostsPage() {
  const boosts = await listAllHeroBoosts();

  const active = boosts.filter((b) => b.status === "ACTIVE");
  const pending = boosts.filter((b) => b.status === "PENDING");
  const expired = boosts.filter((b) => b.status === "EXPIRED");
  const cancelled = boosts.filter((b) => b.status === "CANCELLED" || b.status === "REFUNDED");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Hero Boosts</h1>
          <p className="text-sm text-muted">Manage Hero/Featured event boosts.</p>
        </div>
        <Link href="/admin/boosts" className="text-sm font-semibold text-violet-neon hover:underline">
          Slot Boosts →
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Active" count={active.length} tone="lime" />
        <SummaryCard label="Pending" count={pending.length} tone="warning" />
        <SummaryCard label="Expired" count={expired.length} tone="neutral" />
        <SummaryCard label="Cancelled" count={cancelled.length} tone="danger" />
      </div>

      {/* Boost list */}
      {boosts.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center">
          <p className="text-sm text-muted">No Hero Boosts yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {boosts.map((boost) => (
            <div
              key={boost.id}
              className="glass space-y-3 rounded-3xl p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <Link
                    href={`/events/${boost.eventId}`}
                    className="text-sm font-bold hover:text-violet-neon"
                  >
                    {boost.eventTitle}
                  </Link>
                  <p className="text-xs text-muted">
                    by {boost.organizerName} · ₹{Math.round(boost.amountPaise / 100)}
                  </p>
                </div>
                <Badge tone={statusTone(boost.status)}>{boost.status}</Badge>
              </div>

              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div>
                  <span className="text-muted">Event starts: </span>
                  <span className="font-semibold">{formatDateTime(boost.eventStartsAt)}</span>
                </div>
                <div>
                  <span className="text-muted">Boost started: </span>
                  <span className="font-semibold">{boost.startedAt ? formatDateTime(boost.startedAt) : "—"}</span>
                </div>
                <div>
                  <span className="text-muted">Expires: </span>
                  <span className="font-semibold">{boost.expiresAt ? formatDateTime(boost.expiresAt) : "—"}</span>
                </div>
              </div>

              {boost.utrReference ? (
                <p className="text-xs text-muted">
                  UTR: <span className="font-mono font-bold">{boost.utrReference}</span>
                </p>
              ) : null}

              {/* Admin actions */}
              <HeroBoostAdminActions boost={boost} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusTone(status: string): "lime" | "warning" | "neutral" | "danger" | "violet" {
  switch (status) {
    case "ACTIVE":
      return "lime";
    case "PENDING":
      return "warning";
    case "EXPIRED":
      return "neutral";
    case "CANCELLED":
    case "REFUNDED":
    case "FAILED":
      return "danger";
    default:
      return "violet";
  }
}

function SummaryCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "lime" | "warning" | "neutral" | "danger";
}) {
  const toneClass = {
    lime: "text-lime-neon",
    warning: "text-amber-500",
    neutral: "text-muted",
    danger: "text-red-500",
  }[tone];
  return (
    <div className="glass rounded-2xl p-4">
      <p className={`text-2xl font-black ${toneClass}`}>{count}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
