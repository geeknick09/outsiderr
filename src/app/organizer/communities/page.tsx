import { CommunityForm } from "@/modules/shared";
import { CommunityMembersPanel } from "@/modules/shared";
import { KycStatusBanner } from "@/modules/organizer";
import { OrganizerKycRealtimeRefresher } from "@/modules/organizer";
import { listCommunityMembers, listMyCommunities } from "@/modules/shared/server";
import { getOrganizerGateContext } from "@/modules/organizer/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Communities - Creator Dashboard | Outsiderr" };

export default async function OrganizerCommunitiesPage() {
  const ctx = await getOrganizerGateContext();
  if ("gate" in ctx) return ctx.gate;
  const { user, organizerProfile } = ctx;

  const myCommunities = await listMyCommunities(user);
  const membersArrays = await Promise.all(myCommunities.map((c) => listCommunityMembers(c.id)));
  const communityMembersMap = Object.fromEntries(myCommunities.map((c, i) => [c.id, membersArrays[i]]));

  return (
    <div className="space-y-6 py-6">
      <OrganizerKycRealtimeRefresher userId={user.id} />

      <KycStatusBanner
        kycStatus={organizerProfile.kycStatus ?? "NOT_SUBMITTED"}
        hasPendingChanges={Object.keys(organizerProfile.pendingKyc ?? {}).length > 0}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <CommunityForm />

        <div className="space-y-6">
          {myCommunities.length === 0 ? (
            <p className="glass rounded-3xl p-5 text-sm text-muted">
              No communities yet. Create one to start building your community.
            </p>
          ) : (
            myCommunities.map((community) => (
              <div key={community.id} className="glass rounded-3xl p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <a href={`/communities/${community.id}`} className="flex min-w-0 items-center gap-3 font-bold hover:text-violet-neon">
                    {community.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={community.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-neon/20 text-sm font-black text-violet-neon">
                        {community.name.slice(0, 1)}
                      </span>
                    )}
                    <span className="truncate">{community.name}</span>
                  </a>
                  <a
                    href={`/organizer/communities/${community.id}`}
                    className="rounded-full bg-violet-neon/10 px-3 py-1.5 text-xs font-bold text-violet-neon hover:bg-violet-neon/20"
                  >
                    Manage →
                  </a>
                </div>
                <CommunityMembersPanel community={community} members={communityMembersMap[community.id] ?? []} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
