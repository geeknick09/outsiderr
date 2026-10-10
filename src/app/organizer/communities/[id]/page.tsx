import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CommunityManageTabs } from "@/modules/organizer";
import {
  getCommunity,
  listCommunityMemberDetails,
} from "@/modules/shared/server";
import { getOrganizerGateContext } from "@/modules/organizer/server";
import { createServiceClient } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Manage Community - Outsiderr" };

export default async function OrganizerCommunityManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const ctx = await getOrganizerGateContext();
  if ("gate" in ctx) return ctx.gate;
  const { user, organizerProfile } = ctx;

  const community = await getCommunity(id);
  if (!community || community.ownerId !== organizerProfile.id) notFound();

  const [members, analytics] = await Promise.all([
    listCommunityMemberDetails(community.id),
    (async () => {
      const supabase = createServiceClient();
      const { data } = await supabase.rpc("community_analytics", { p_community_id: community.id });
      return data as {
        total_members: number; new_members_30d: number; pending_requests: number;
        events_total: number; attendees: number; repeat_attendees: number;
        views: number; followers: number;
      } | null;
    })(),
  ]);

  const supabase = createServiceClient();
  const [{ data: importRows }, { data: nonJoiners }, { data: inviteToken }] = await Promise.all([
    supabase
      .from("community_member_imports")
      .select("id, filename, status, valid_rows, invalid_rows, created_at")
      .eq("community_id", community.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("community_non_joiners", { p_community_id: community.id }),
    supabase.rpc("get_community_invite_token", { p_community_id: community.id, p_actor_id: user.id }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="overflow-hidden rounded-3xl">
        {community.coverUrl ? (
          <div className="relative h-44 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={community.coverUrl} alt={`${community.name} cover`} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-28 w-full bg-gradient-to-r from-violet-neon/30 via-fuchsia-500/20 to-lime-neon/20" />
        )}
        <div className="glass -mt-10 flex items-end gap-4 rounded-t-3xl p-5">
          {community.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={community.avatarUrl} alt={community.name} className="h-16 w-16 rounded-2xl border-2 border-white object-cover dark:border-zinc-900" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-neon/20 text-2xl font-black text-violet-neon">
              {community.name.slice(0, 1)}
            </span>
          )}
          <div>
            <h1 className="text-2xl font-black tracking-tight">{community.name}</h1>
            <p className="text-sm text-muted">
              {community.memberCount} members · {community.membershipType.toLowerCase().replace("_", " ")} community
            </p>
          </div>
        </div>
      </div>
      <CommunityManageTabs
        community={community}
        members={members}
        imports={(importRows ?? []).map((i) => ({
          id: i.id, filename: i.filename, status: i.status,
          validRows: i.valid_rows, invalidRows: i.invalid_rows, createdAt: i.created_at,
        }))}
        analytics={analytics}
        nonJoiners={nonJoiners ?? []}
        inviteToken={typeof inviteToken === "string" ? inviteToken : null}
        initialTab={tab === "analytics" || tab === "requests" || tab === "import" ? tab : "members"}
      />
    </div>
  );
}
