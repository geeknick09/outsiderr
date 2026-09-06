import { redirect } from "next/navigation";

import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { getCurrentUser } from "@/lib/auth";
import { getUserProfile } from "@/lib/data/profile";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Profile — Outsiderr" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fprofile");

  const profile = await getUserProfile(user);

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
    </div>
  );
}
