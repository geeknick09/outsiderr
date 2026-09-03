import { HeroBoostAdminActions } from "@/components/admin/hero-boost-admin-actions";
import { SlotPriceEditor } from "@/components/admin/slot-price-editor";
import { Badge } from "@/components/ui/badge";
import { listBoostSlotPrices, listOccupiedSlots, listActiveBoosts } from "@/lib/data/boosts";
import { listAllHeroBoosts } from "@/lib/data/hero-boosts";
import { formatDateTime, formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Boosts — Outsiderr" };

export default async function AdminBoostsPage() {
  const [activeBoosts, slotPrices, occupied, heroBoosts] = await Promise.all([
    listActiveBoosts(),
    listBoostSlotPrices(),
    listOccupiedSlots(),
    listAllHeroBoosts(),
  ]);

  const heroActive = heroBoosts.filter((b) => b.status === "ACTIVE");
  const heroPending = heroBoosts.filter((b) => b.status === "PENDING");
  const heroExpired = heroBoosts.filter((b) => b.status === "EXPIRED");
  const heroCancelled = heroBoosts.filter((b) => b.status === "CANCELLED" || b.status === "REFUNDED");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black">Boosts</h1>
        <p className="text-sm text-muted">
          {activeBoosts.length} active slot boosts · {heroActive.length} active Hero boosts · {heroPending.length} Hero pending
        </p>
      </div>

      {/* ============ Hero Boosts Section ============ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Hero Boosts</h2>
          <Badge tone="pink">Featured</Badge>
        </div>

        {/* Hero summary cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroSummaryCard label="Active" count={heroActive.length} tone="lime" />
          <HeroSummaryCard label="Pending" count={heroPending.length} tone="warning" />
          <HeroSummaryCard label="Expired" count={heroExpired.length} tone="neutral" />
          <HeroSummaryCard label="Cancelled" count={heroCancelled.length} tone="danger" />
        </div>

        {/* Hero boost list */}
        {heroBoosts.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">No Hero Boosts yet.</p>
        ) : (
          <div className="space-y-3">
            {heroBoosts.map((boost) => (
              <div key={boost.id} className="glass space-y-3 rounded-3xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <a
                      href={`/events/${boost.eventId}`}
                      className="text-sm font-bold hover:text-violet-neon"
                    >
                      {boost.eventTitle}
                    </a>
                    <p className="text-xs text-muted">
                      by {boost.organizerName} · ₹{Math.round(boost.amountPaise / 100)}
                    </p>
                  </div>
                  <Badge tone={heroStatusTone(boost.status)}>{boost.status}</Badge>
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

                <HeroBoostAdminActions boost={boost} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ============ Slot Boosts Section ============ */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold">Slot Boosts</h2>
        <p className="text-sm text-muted">
          Slot boosts are auto-activated when an organizer picks a free slot. Admins can view occupancy and change prices.
        </p>

        {/* Slot grid */}
        <div className="glass rounded-3xl p-5">
          <h3 className="mb-4 text-sm font-bold">Slot availability & pricing</h3>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {slotPrices.map((sp) => {
              const taken = occupied.includes(sp.slot);
              return (
                <div
                  key={sp.slot}
                  className={cn(
                    "flex flex-col items-center rounded-2xl border p-2 text-xs",
                    taken
                      ? "border-red-400/50 bg-red-500/10 text-red-500"
                      : "border-emerald-400/50 bg-emerald-500/10 text-emerald-600",
                  )}
                >
                  <span className="text-base font-black">{sp.slot}</span>
                  <span className="text-[10px]">{taken ? "Taken" : "Free"}</span>
                  <span className="text-[10px] text-muted">{formatPaise(sp.pricePaise)}/day</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Admin can edit slot prices */}
        <SlotPriceEditor slotPrices={slotPrices} />

        {/* Active slot boosts list */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold">Active slot boosts</h3>
          {activeBoosts.length === 0 ? (
            <p className="glass rounded-3xl p-5 text-sm text-muted">No active slot boosts.</p>
          ) : (
            activeBoosts.map((boost) => (
              <div key={boost.id} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Slot {boost.slot}</p>
                  <p className="text-xs text-muted">
                    {formatPaise(boost.amountPaidPaise)} paid · UTR: {boost.utrReference ?? "—"}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(boost.startsAt)} → {formatDateTime(boost.endsAt)}
                  </p>
                </div>
                <Badge tone="lime">Active</Badge>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function heroStatusTone(status: string): "lime" | "warning" | "neutral" | "danger" | "violet" {
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

function HeroSummaryCard({
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
