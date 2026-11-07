import { CommunityForm } from "@/modules/shared";
import { KycStatusBanner } from "@/modules/organizer";
import { OrganizerKycRealtimeRefresher } from "@/modules/organizer";
import { CommunityList } from "@/modules/organizer";
import { listMyCommunities } from "@/modules/shared/server";
import { getOrganizerGateContext } from "@/modules/organizer/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Communities - Creator Dashboard | Outsiderr" };

export default async function OrganizerCommunitiesPage() {
  const ctx = await getOrganizerGateContext();
  if ("gate" in ctx) return ctx.gate;
  const { user, organizerProfile } = ctx;

  const myCommunities = await listMyCommunities(user);

  return (
    <div className="space-y-6 py-6">
      <OrganizerKycRealtimeRefresher userId={user.id} />

      <KycStatusBanner
        kycStatus={organizerProfile.kycStatus ?? "NOT_SUBMITTED"}
        hasPendingChanges={Object.keys(organizerProfile.pendingKyc ?? {}).length > 0}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <CommunityForm />

        <div>
          <CommunityList communities={myCommunities} />
        </div>
      </div>
    </div>
  );
}
