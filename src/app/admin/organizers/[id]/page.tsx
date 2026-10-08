import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, BadgeCheck, ArrowLeft, ExternalLink } from "lucide-react";

import { getAdminOrganizerDetail } from "@/modules/admin/server";
import { formatPaise, formatDateTime } from "@/modules/shared";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Organizer Detail - Outsiderr" };

export default async function AdminOrganizerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getAdminOrganizerDetail(id);
  if (!detail) notFound();

  const { organizer: o, owner, events, stats } = detail;
  const isPremium = !!o.premiumUntil && new Date(o.premiumUntil).getTime() > Date.now();

  return (
    <div className="space-y-6">
      <Link href="/admin/organizers" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-violet-neon">
        <ArrowLeft className="h-4 w-4" /> All organizers
      </Link>

      {/* Header */}
      <div className="glass flex items-start gap-4 rounded-3xl p-6">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-zinc-200 dark:bg-white/10">
          {o.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black">{o.name}</h1>
            {isPremium ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                <Crown className="h-3 w-3" /> Premium
              </span>
            ) : null}
            {o.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                <BadgeCheck className="h-3 w-3" /> Verified
              </span>
            ) : null}
          </div>
          {o.bio ? <p className="mt-1 text-sm text-muted">{o.bio}</p> : null}
          <p className="mt-1 text-xs text-muted">
            KYC: {o.kycStatus}
            {isPremium ? ` · Premium until ${formatDateTime(o.premiumUntil!)}` : ""}
            {" · Joined "}{formatDateTime(o.createdAt)}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Events" value={String(stats.totalEvents)} sub={`${stats.publishedEvents} published`} />
        <Stat label="Tickets sold" value={String(stats.ticketsSold)} />
        <Stat label="Gross revenue" value={formatPaise(stats.grossRevenuePaise)} />
        <Stat
          label="Premium plans bought"
          value={String(stats.premiumPurchases.length)}
          sub={stats.premiumPurchases[0]?.paidAt ? `last: ${formatDateTime(stats.premiumPurchases[0].paidAt)}` : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Owner + KYC/bank */}
        <div className="space-y-6">
          <Section title="Owner">
            <Row label="Name" value={owner?.fullName} />
            <Row label="Phone" value={owner?.phone} />
            <Row label="Email" value={owner?.email} />
          </Section>

          <Section title="KYC & Tax">
            <Row label="PAN" value={o.panNumber ? `${o.panNumber} (${o.panName ?? "-"})` : null} />
            <Row label="GST" value={o.gstNumber ? `${o.gstNumber} (${o.gstBusinessName ?? "-"})` : null} />
          </Section>

          <Section title="Bank / Payout">
            <Row label="UPI" value={o.upiId} />
            <Row label="Account" value={o.bankAccountNumber ? `****${o.bankAccountNumber.slice(-4)} (${o.bankAccountName ?? "-"})` : null} />
            <Row label="IFSC" value={o.bankIfsc} />
            <Row label="Type" value={o.bankAccountType} />
          </Section>

          <Section title="Socials">
            <Row label="Instagram" value={o.instagramUrl} />
            <Row label="YouTube" value={o.youtubeUrl} />
            <Row label="X" value={o.xUrl} />
            <Row label="Facebook" value={o.facebookUrl} />
            <Row label="LinkedIn" value={o.linkedinUrl} />
          </Section>

          {stats.premiumPurchases.length > 0 ? (
            <Section title="Premium purchases">
              {stats.premiumPurchases.map((p, i) => (
                <Row
                  key={i}
                  label={p.paidAt ? formatDateTime(p.paidAt) : "—"}
                  value={`${p.months} months - ${formatPaise(p.amountPaise)}`}
                />
              ))}
            </Section>
          ) : null}
        </div>

        {/* Events */}
        <Section title={`Events (${events.length})`}>
          {events.length === 0 ? (
            <p className="text-sm text-muted">No events yet.</p>
          ) : (
            <div className="space-y-1.5">
              {events.map((e) => (
                <Link
                  key={e.id}
                  href={`/events/${e.id}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2 text-sm transition-colors hover:border-violet-neon dark:border-white/10"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">{e.title}</span>
                  <span className="ml-3 flex shrink-0 items-center gap-2 text-xs text-muted">
                    {e.city} · {formatDateTime(e.startsAt)} · {e.status}
                    <ExternalLink className="h-3 w-3" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl p-5">
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value ?? "-"}</span>
    </div>
  );
}
