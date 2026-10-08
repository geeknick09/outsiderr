import { OrganizerChrome } from "@/modules/organizer";
import { getCurrentUser } from "@/modules/shared/server";
import { getOrganizerProfile, getOrganizerFollowerCount } from "@/modules/shared/server";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const organizer = user ? await getOrganizerProfile(user) : null;
  const followerCount = organizer ? await getOrganizerFollowerCount(organizer.id) : 0;

  return (
    <div>
      <OrganizerChrome organizer={organizer} followerCount={followerCount} />
      {children}
    </div>
  );
}
