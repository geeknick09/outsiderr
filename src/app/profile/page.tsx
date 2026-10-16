import { redirect } from "next/navigation";

import { EditProfileForm, FollowingSection } from "@/modules/web";
import { getCurrentUser } from "@/modules/shared/server";
import { getUserProfile } from "@/modules/shared/server";
import { listFollowedOrganizers, getUserAttendanceCount, listMyCommunityMemberships } from "@/modules/shared/server";
import { listFollowedCommunities } from "@/modules/shared/server";
import { computeBadges, BADGE_TONES, formatPaise } from "@/modules/shared";
import { cn } from "@/modules/shared";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Profile - Outsiderr" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fprofile");

  const [profile, followedOrgs, followedComms, attended, memberships] = await Promise.all([
    getUserProfile(user),
    listFollowedOrganizers(user),
    listFollowedCommunities(user),
    getUserAttendanceCount(user.id),
    listMyCommunityMemberships(user),
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