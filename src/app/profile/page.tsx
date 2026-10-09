import { redirect } from "next/navigation";

import { EditProfileForm, FollowingSection } from "@/modules/web";
import { getCurrentUser } from "@/modules/shared/server";
import { getUserProfile } from "@/modules/shared/server";
import { listFollowedOrganizers, getUserAttendanceCount } from "@/modules/shared/server";
import { listFollowedCommunities } from "@/modules/shared/server";
import { getPromoterDashboard } from "@/modules/shared/server";
import { computeBadges, BADGE_TONES, formatPaise } from "@/modules/shared";
import { cn } from "@/modules/shared";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Profile - Outsiderr" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fprofile");

  const [profile, followedOrgs, followedComms, attended, promoter] = await Promise.all([
    getUserProfile(user),
    listFollowedOrganizers(user),
    listFollowedCommunities(user),
    getUserAttendanceCount(user.id),
    getPromoterDashboard(user),
  ]);
  const badges = computeBadges({ attendedTotal: attended });

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">My Profile</h1>
        <p className="mt-1 text-sm text-muted">
          Update your details and pick the tags you&apos;re interested in.
        </p>
      </div>

      {badges.length ? (
        <section className="glass rounded-3xl p-5">
          <h2 className="mb-3 text-base font-bold">Your badges</h2>
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <span key={b.key} title={b.hint} className={cn("rounded-full px-3 py-1 text-xs font-bold", BADGE_TONES[b.key])}>
                {b.label}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {promoter.isPromoter ? (
        <section className="glass rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">Promoter</h2>
            <Link href="/promoter" className="text-xs font-semibold text-violet-neon hover:underline">
              Full dashboard →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-zinc-100 p-3 text-center dark:bg-white/5">
              <p className="text-xs text-muted">Earned</p>
              <p className="text-sm font-black">{formatPaise(promoter.balances.earnedPaise)}</p>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-3 text-center dark:bg-white/5">
              <p className="text-xs text-muted">Payable</p>
              <p className="text-sm font-black text-lime-500">{formatPaise(promoter.balances.payablePaise)}</p>
            </div>
            <div className="rounded-2xl bg-zinc-100 p-3 text-center dark:bg-white/5">
              <p className="text-xs text-muted">Paid out</p>
              <p className="text-sm font-black">{formatPaise(promoter.balances.paidPaise)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            {promoter.hasPayoutDetails
              ? `Bank ${promoter.masked.account ?? ""} · IFSC ${promoter.masked.ifsc ?? ""} · PAN ${promoter.masked.pan ?? ""}`
              : "No payout bank details yet — add them on the promoter dashboard before commissions can be paid."}
          </p>
        </section>
      ) : null}

      <FollowingSection
        organizers={followedOrgs}
        communities={followedComms}
      />

      <EditProfileForm
        initialName={profile?.fullName ?? user.name}
        initialPhone={profile?.phone ?? user.phone ?? ""}
        initialEmail={user.email ?? ""}
        initialBirthDate={profile?.birthDate ?? ""}
        initialGender={profile?.gender ?? ""}
        initialAvatarUrl={profile?.avatarUrl ?? ""}
        initialInstagramUrl={profile?.instagramUrl ?? ""}
        initialYoutubeUrl={profile?.youtubeUrl ?? ""}
        initialXUrl={profile?.xUrl ?? ""}
        initialFacebookUrl={profile?.facebookUrl ?? ""}
        initialLinkedinUrl={profile?.linkedinUrl ?? ""}
        initialTags={profile?.interestedTags ?? []}
      />
    </div>
  );
}
