import { ClubForm } from "@/modules/shared";
import { ClubMembersPanel } from "@/modules/shared";
import { KycStatusBanner } from "@/modules/organizer";
import { OrganizerHeader } from "@/modules/organizer";
import { OrganizerKycRealtimeRefresher } from "@/modules/organizer";
import { listClubMembers, listMyClubs } from "@/modules/shared/server";
import { getOrganizerGateContext } from "@/modules/organizer/server";
import { getOrganizerFollowerCount } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Organizer Clubs - Outsiderr" };

export default async function OrganizerClubsPage() {
  const ctx = await getOrganizerGateContext();
  if ("gate" in ctx) return ctx.gate;
  const { user, organizerProfile } = ctx;

  const [followerCount, myClubs] = await Promise.all([
    getOrganizerFollowerCount(organizerProfile.id),
    listMyClubs(user),
  ]);
  const membersArrays = await Promise.all(myClubs.map((c) => listClubMembers(c.id)));
  const clubMembersMap = Object.fromEntries(myClubs.map((c, i) => [c.id, membersArrays[i]]));

  return (
    <div className="space-y-6 py-6">
      <OrganizerKycRealtimeRefresher userId={user.id} />

      <OrganizerHeader organizer={organizerProfile} followerCount={followerCount} />

      <KycStatusBanner
        kycStatus={organizerProfile.kycStatus ?? "NOT_SUBMITTED"}
        hasPendingChanges={Object.keys(organizerProfile.pendingKyc ?? {}).length > 0}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <ClubForm />

        <div className="space-y-6">
          {myClubs.length === 0 ? (
            <p className="glass rounded-3xl p-5 text-sm text-muted">
              No clubs yet. Create one to start building your community.
            </p>
          ) : (
            myClubs.map((club) => (
              <div key={club.id} className="glass rounded-3xl p-5">
                <ClubMembersPanel club={club} members={clubMembersMap[club.id] ?? []} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
