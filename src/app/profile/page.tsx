import { redirect } from "next/navigation";

import { EditProfileForm, FollowingSection } from "@/modules/web";
import { getCurrentUser } from "@/modules/shared/server";
import { getUserProfile } from "@/modules/shared/server";
import { listFollowedOrganizers, listMyCommunityMemberships, getUserBadgeDetails } from "@/modules/shared/server";
import { listFollowedCommunities } from "@/modules/shared/server";
import { BADGE_LEVELS, BADGE_TONES, formatDateTime } from "@/modules/shared";
import { cn } from "@/modules/shared";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Profile - Outsiderr" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fprofile");

  const [profile, followedOrgs, followedComms, badges, memberships] = await Promise.all([
    getUserProfile(user),
    listFollowedOrganizers(user),
    listFollowedCommunities(user),
    getUserBadgeDetails(user.id),
    listMyCommunityMemberships(user),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">My Profile</h1>
        <p className="mt-1 text-sm text-muted">
          Update your details and pick the tags you&apos;re interested in.
        </p>
      </div>


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

      <section id="badges" className="glass scroll-mt-24 rounded-3xl p-5">
        <h2 className="mb-3 text-base font-bold">Your badges</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {BADGE_LEVELS.map((def) => {
            const earned = badges.filter((b) => b.key === def.key);
            if (!earned.length) {
              return (
                <div key={def.key} className="rounded-2xl border border-dashed border-zinc-200 p-3 opacity-50 dark:border-white/10">
                  <span className="rounded-full bg-zinc-500/15 px-2.5 py-0.5 text-[10px] font-bold text-zinc-500">
                    {def.label}
                  </span>
                  <p className="mt-1.5 text-xs text-muted">{def.hint}</p>
                </div>
              );
            }
            return earned.map((b, i) => (
              <div key={`${b.key}-${i}`} className="rounded-2xl border border-violet-neon/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold", BADGE_TONES[b.key])}>
                    {b.label}
                  </span>
                  {b.earnedAt && (
                    <span className="text-[10px] text-muted">{formatDateTime(b.earnedAt)}</span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted">{b.hint}</p>
                {b.communityName && (
                  <p className="mt-1 text-[10px] font-semibold text-violet-neon">{b.communityName}</p>
                )}
              </div>
            ));
          })}
        </div>
      </section>

      <section className="glass rounded-3xl p-5">
        <h2 className="mb-3 text-base font-bold">Communities</h2>
        {memberships.length === 0 ? (
          <p className="text-sm text-muted">
            Not a member of any community yet -{" "}
            <Link href="/communities" className="font-semibold text-violet-neon hover:underline">
              explore communities
            </Link>{" "}
            and join the ones that fit your scene.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {memberships.map((c) => (
              <Link
                key={c.id}
                href={`/communities/${c.id}`}
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      <FollowingSection
        organizers={followedOrgs}
        communities={followedComms}
      />
    </div>
  );
}