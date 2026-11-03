import { OrganizerChrome } from "@/modules/organizer";
import { getCurrentUser } from "@/modules/shared/server";
import { getOrganizerProfile, getOrganizerFollowerCount } from "@/modules/shared/server";

/** Swallow non-critical fetch failures so router.refresh() never crashes the layout. */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const user = await safe(getCurrentUser(), null);
  const organizer = user ? await safe(getOrganizerProfile(user), null) : null;
  const followerCount = organizer ? await safe(getOrganizerFollowerCount(organizer.id), 0) : 0;

  return (
    <div>
      <OrganizerChrome organizer={organizer} followerCount={followerCount} />
      {children}
    </div>
  );
}
