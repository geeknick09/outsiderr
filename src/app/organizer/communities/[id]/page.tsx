import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CommunityManageTabs, MemberCountToggle } from "@/modules/organizer";

import {
  getCommunity,
  listCommunityMemberDetails,
  listJoinQuestions,
} from "@/modules/shared/server";
import { getOrganizerGateContext } from "@/modules/organizer/server";
import { createServiceClient } from "@/modules/shared/server";
import { getCommunityWarmAudience } from "@/modules/analytics/server";

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

  const [members, analytics, joinQuestions, demographics] = await Promise.all([
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
    listJoinQuestions(community.id),
    (async () => {
      const svc = createServiceClient();
      const now = Date.now();
      const [dauRes, mauRes, membersRes] = await Promise.all([
        svc.from("page_views").select("user_id", { count: "exact", head: true })
          .eq("entity_type", "COMMUNITY").eq("entity_id", community.id)
          .gte("created_at", new Date(now - 864e5).toISOString()),
        svc.from("page_views").select("user_id", { count: "exact", head: true })
          .eq("entity_type", "COMMUNITY").eq("entity_id", community.id)
          .gte("created_at", new Date(now - 30 * 864e5).toISOString()),
        svc.from("community_members").select("user_id").eq("community_id", community.id).eq("status", "ACCEPTED"),
      ]);
      const memberIds = (membersRes.data ?? []).map((m) => m.user_id);
      const { data: profiles } = memberIds.length
        ? await svc.from("profiles").select("id, gender, birth_date").in("id", memberIds)
        : { data: [] };
      const gender: Record<string, number> = {};
      const age: Record<string, number> = {};
      for (const p of profiles ?? []) {
        const g = p.gender ?? "Not specified";
        gender[g] = (gender[g] ?? 0) + 1;
        if (p.birth_date) {
          const a = Math.floor((now - new Date(p.birth_date).getTime()) / 31557600000);
          const b = a < 18 ? "Under 18" : a < 25 ? "18-24" : a < 35 ? "25-34" : a < 45 ? "35-44" : "45+";
          age[b] = (age[b] ?? 0) + 1;
        }
      }
      return { dau: dauRes.count ?? 0, mau: mauRes.count ?? 0, gender, age };
    })(),
  ]);

  const supabase = createServiceClient();
  const [{ data: importRows }, { data: inviteToken }] = await Promise.all([
    supabase
      .from("community_member_imports")
      .select("id, filename, status, valid_rows, invalid_rows, created_at")
      .eq("community_id", community.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_community_invite_token", { p_community_id: community.id, p_actor_id: user.id }),
  ]);

  // Community events + per-event stats (views / sold / check-ins / net).
  const { data: commEvents } = await supabase
    .from("events")
    .select("id, title, starts_at, status")
    .eq("community_id", community.id)
    .order("starts_at", { ascending: false });
  const eventIds = (commEvents ?? []).map((e) => e.id);
  const [{ data: evViews }, { data: evOrders }, { data: evTickets }] = await Promise.all([
    eventIds.length
      ? supabase.from("page_views").select("entity_id").eq("entity_type", "EVENT").in("entity_id", eventIds)
      : Promise.resolve({ data: [] }),
    eventIds.length
      ? supabase.from("orders").select("event_id, organizer_payout_paise").eq("status", "CONFIRMED").in("event_id", eventIds)
      : Promise.resolve({ data: [] }),
    eventIds.length
      ? supabase.from("tickets").select("event_id").eq("status", "USED").in("event_id", eventIds)
      : Promise.resolve({ data: [] }),
  ]);
  const countBy = (rows: { event_id?: string | null; entity_id?: string | null }[] | null, key: "event_id" | "entity_id") => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) { const k = r[key] as string; m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };
  const viewMap = countBy(evViews, "entity_id");
  const checkinMap = countBy(evTickets, "event_id");
  const netMap = new Map<string, number>();
  const soldMap = new Map<string, number>();
  for (const o of evOrders ?? []) {
    soldMap.set(o.event_id, (soldMap.get(o.event_id) ?? 0) + 1);
    netMap.set(o.event_id, (netMap.get(o.event_id) ?? 0) + (o.organizer_payout_paise ?? 0));
  }
  const events = (commEvents ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    status: e.status,
    views: viewMap.get(e.id) ?? 0,
    confirmedOrders: soldMap.get(e.id) ?? 0,
    checkIns: checkinMap.get(e.id) ?? 0,
    netPayoutPaise: netMap.get(e.id) ?? 0,
  }));
  const warmLeads = await getCommunityWarmAudience(community.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="overflow-hidden rounded-3xl">
        {community.coverUrl ? (
          <div className="relative -mx-4 overflow-hidden sm:rounded-b-3xl">
            <div className="relative hidden aspect-video max-h-[440px] w-full sm:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={community.coverUrl} alt={`${community.name} cover`} className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />
            </div>
            <div className="relative aspect-[3/4] max-h-[70vh] w-full sm:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={community.mobileCoverUrl ?? community.coverUrl} alt={`${community.name} cover`} className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />
            </div>
          </div>
        ) : (
          <div className="h-28 w-full bg-gradient-to-r from-violet-neon/30 via-fuchsia-500/20 to-lime-neon/20" />
        )}
        <div className="glass mt-4 flex items-start gap-4 rounded-3xl p-5">
          {community.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={community.avatarUrl} alt={community.name} className="h-20 w-20 rounded-2xl border-2 border-white object-cover dark:border-zinc-900" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-neon/20 text-3xl font-black text-violet-neon">
              {community.name.slice(0, 1)}
            </span>
          )}
          <div>
            <h1 className="text-2xl font-black tracking-tight">{community.name}</h1>
            <p className="text-sm text-muted">
              {community.memberCount} members · {community.membershipType.toLowerCase().replace("_", " ")} community
            </p>
            <div className="mt-1.5">
              <MemberCountToggle communityId={community.id} show={community.showMemberCount} />
            </div>
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
        demographics={demographics}
        events={events}
        warmLeads={warmLeads}
        inviteToken={typeof inviteToken === "string" ? inviteToken : null}
        initialTab={["details", "members", "analytics", "requests", "import", "events"].includes(tab ?? "") ? tab as "details" | "members" | "analytics" | "requests" | "import" | "events" : "details"}
        editInitial={{
          id: community.id,
          name: community.name,
          bio: community.bio,
          city: community.city as string | null,
          category: community.category,
          subcategory: community.subcategory,
          avatarUrl: community.avatarUrl,
          coverUrl: community.coverUrl,
          mobileCoverUrl: community.mobileCoverUrl,
          instagramHandle: community.instagramHandle,
          youtubeUrl: community.youtubeUrl,
          xUrl: community.xUrl,
          linkedinUrl: community.linkedinUrl,
          facebookUrl: community.facebookUrl,
          websiteUrl: community.websiteUrl,
          upiId: community.upiId,
          membershipType: community.membershipType,
          terms: community.terms,
        }}
        joinQuestions={joinQuestions.map((q) => ({ question: q.question, isMandatory: q.isMandatory }))}
      />
    </div>
  );
}
