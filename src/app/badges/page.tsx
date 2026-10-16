import { redirect } from "next/navigation";
import { Award } from "lucide-react";

import { BADGE_LEVELS, BADGE_TONES, cn, formatDateTime } from "@/modules/shared";
import { getCurrentUser, getUserBadgeDetails } from "@/modules/shared/server";

export const metadata = { title: "My Badges - Outsiderr" };

export default async function BadgesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fbadges");

  const badges = await getUserBadgeDetails(user.id);
  const earned = badges.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
          <Award className="h-6 w-6 text-violet-neon" />
          My Badges
        </h1>
        <p className="mt-1 text-sm text-muted">
          {earned
            ? `${earned} earned - keep showing up, keep stacking.`
            : "Badges you earn by showing up, joining early and bringing people in."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {BADGE_LEVELS.map((def) => {
          const wins = badges.filter((b) => b.key === def.key);
          if (!wins.length) {
            return (
              <div
                key={def.key}
                className="rounded-2xl border border-dashed border-zinc-200 p-4 opacity-50 dark:border-white/10"
              >
                <span className="rounded-full bg-zinc-500/15 px-3 py-1 text-xs font-bold text-zinc-500">
                  {def.label}
                </span>
                <p className="mt-2 text-xs text-muted">{def.hint}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Locked</p>
              </div>
            );
          }
          return wins.map((b, i) => (
            <div key={`${b.key}-${i}`} className="glass rounded-2xl border border-violet-neon/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("rounded-full px-3 py-1 text-xs font-bold", BADGE_TONES[b.key])}>
                  {b.label}
                </span>
                {b.earnedAt && (
                  <span className="text-[10px] text-muted">{formatDateTime(b.earnedAt)}</span>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">{b.hint}</p>
              {b.communityName && (
                <p className="mt-1 text-[10px] font-semibold text-violet-neon">{b.communityName}</p>
              )}
            </div>
          ));
        })}
      </div>
    </div>
  );
}
