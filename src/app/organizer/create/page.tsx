import { redirect } from "next/navigation";
import { lazy, Suspense } from "react";

import { getCurrentUser , listMyCommunities } from "@/modules/shared/server";
import { getSettingInt } from "@/modules/shared/server";
import { getOrganizerProfile } from "@/modules/shared/server";
import { getOrganizerAccessState } from "@/modules/shared";
import { getTermsVersion, getOrganizerPastEventsForLinking, getDraftRetentionDays } from "@/modules/shared/server";

// Lazy load EventForm - it pulls in Leaflet (~140kB) via MapPicker
const EventForm = lazy(() =>
  import("@/modules/organizer").then((m) => ({ default: m.EventForm })),
);

export const dynamic = "force-dynamic";

export const metadata = { title: "Create Event - Outsiderr" };

export default async function CreateEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer%2Fcreate");

  const organizerProfile = await getOrganizerProfile(user);
  if (!organizerProfile) redirect("/organizer"); // Must be an organizer

  const rejectionLimit = await getSettingInt("organizer_rejection_limit");
  const accessState = getOrganizerAccessState({
    kycStatus: organizerProfile.kycStatus,
    rejectionCount: organizerProfile.rejectionCount,
    rejectionLimit,
  });

  if (accessState.blocked) {
    redirect("/organizer");
  }

  const [termsVersion, pastEventsForLinking, draftRetentionDays, myCommunities] = await Promise.all([
    getTermsVersion(),
    getOrganizerPastEventsForLinking(organizerProfile.id),
    getDraftRetentionDays(),
    listMyCommunities(user),
  ]);

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-black">Create Event</h1>
        <p className="text-sm text-muted">Fill in the details to publish your event</p>
      </div>

      <Suspense
        fallback={
          <div className="glass flex h-96 items-center justify-center rounded-3xl">
            <p className="text-sm text-muted">Loading event form…</p>
          </div>
        }
      >
        <EventForm
          organizerName={organizerProfile.name}
          termsVersion={termsVersion}
          pastEvents={pastEventsForLinking}
          draftRetentionDays={draftRetentionDays}
          communities={myCommunities.filter((c) => c.verified).map((c) => ({ id: c.id, name: c.name }))}
        />
      </Suspense>
    </div>
  );
}
