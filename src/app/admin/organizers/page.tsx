import Link from "next/link";
import { Crown, BadgeCheck } from "lucide-react";

import { listAdminOrganizers } from "@/modules/admin/server";
import { formatDateTime } from "@/modules/shared";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Organizers - Outsiderr" };

export default async function AdminOrganizersPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const { tier } = await searchParams;
  const showPremium = tier !== "normal";

  const organizers = await listAdminOrganizers();
  const premium = organizers.filter((o) => o.isPremium);
  const normal = organizers.filter((o) => !o.isPremium);
  const visible = showPremium ? premium : normal;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Crown className="h-6 w-6 text-amber-400" />
          Organizers
        </h1>
        <p className="text-sm text-muted">
          {premium.length} premium · {normal.length} normal
        </p>
      </div>

      <div className="flex gap-2">
        <Link
          href="/admin/organizers"
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            showPremium
              ? "bg-amber-400/20 text-amber-400"
              : "border border-zinc-200 text-muted hover:border-amber-400/50 dark:border-white/10"
          }`}
        >
          Premium ({premium.length})
        </Link>
        <Link
          href="/admin/organizers?tier=normal"
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            !showPremium
              ? "bg-neon-gradient text-white shadow-glow-violet"
              : "border border-zinc-200 text-muted hover:border-violet-neon dark:border-white/10"
          }`}
        >
          Normal ({normal.length})
        </Link>
      </div>

      <div className="space-y-2">
        {visible.map((org) => (
          <Link
            key={org.id}
            href={`/admin/organizers/${org.id}`}
            className="glass flex items-center gap-3 rounded-2xl p-4 transition-colors hover:border-violet-neon"
          >
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-zinc-200 dark:bg-white/10">
              {org.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{org.name}</p>
              <p className="text-xs text-muted">
                {org.ownerName ?? "-"} · {org.eventCount} event{org.eventCount === 1 ? "" : "s"} · joined {formatDateTime(org.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {org.isPremium ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                  <Crown className="h-3 w-3" />
                  Premium
                </span>
              ) : null}
              {org.verified ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                  <BadgeCheck className="h-3 w-3" />
                  Verified
                </span>
              ) : null}
              <span className="text-xs text-muted">{org.kycStatus}</span>
            </div>
          </Link>
        ))}
        {visible.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-sm text-muted">
            {showPremium ? "No premium organizers yet." : "No normal organizers."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
