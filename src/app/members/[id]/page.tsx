import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Award, CalendarDays } from "lucide-react";

import { Badge } from "@/modules/shared";
import { getCurrentUser, createClient } from "@/modules/shared/server";
import { computeBadges, BADGE_TONES } from "@/modules/shared";
import { getUserAttendanceCount } from "@/modules/shared/server";
import { getOrganizerProfile } from "@/modules/shared/server";
import { cityLabel, formatDateTime } from "@/modules/shared";
import { cn } from "@/modules/shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Member - Outsiderr" };

/**
 * Member profile - public view. Shows name, member-since, attended events,
 * badges. Organizers see extra detail via the community manage page.
 */
export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, instagram_url, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();

  const [attended, { data: memberships }, { data: attendedEvents }] = await Promise.all([
    getUserAttendanceCount(id),
    supabase
      .from("community_members")
      .select("community_id, status, created_at")
      .eq("user_id", id)
      .eq("status", "ACCEPTED"),
    supabase
      .from("tickets")
      .select("event_id, checked_in_at")
      .eq("user_id", id)
      .eq("status", "USED")
      .order("checked_in_at", { ascending: false })
      .limit(12),
  ]);

  const communityIds = (memberships ?? []).map((m) => m.community_id);
  const { data: comms } = communityIds.length
    ? await supabase.from("communities").select("id, name, owner_id").in("id", communityIds)
    : { data: [] };
  const commMap = Object.fromEntries((comms ?? []).map((c) => [c.id, c]));

  // founding member = joined a community within 30 days of its creation
  const { data: commMeta } = communityIds.length
    ? await supabase.from("communities").select("id, created_at").in("id", communityIds)
    : { data: [] };
  const founding = (memberships ?? []).some((m) => {
    const cc = (commMeta ?? []).find((c) => c.id === m.community_id);
    if (!cc) return false;
    return new Date(m.created_at).getTime() - new Date(cc.created_at).getTime() < 30 * 86400e3;
  });

  // referrals = members who joined via this user's invite code
  const { count: referrals } = await supabase
    .from("community_members")
    .select("id", { count: "exact", head: true })
    .in(
      "referred_by_member_id",
      (await supabase.from("community_members").select("id").eq("user_id", id)).data?.map((r) => r.id) ?? [""],
    );

  const eventIds = (attendedEvents ?? []).map((t) => t.event_id);
  const { data: events } = eventIds.length
    ? await supabase.from("events").select("id, title, starts_at, city, venue_name").in("id", eventIds)
    : { data: [] };
  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e]));

  const badges = computeBadges({
    attendedTotal: attended,
    referrals: referrals ?? 0,
    foundingMember: founding,
  });

  // Community champion: ≥15 attended within a single community
  const perCommunity: Record<string, number> = {};
  for (const t of attendedEvents ?? []) {
    const e = eventMap[t.event_id];
    const cid = (e as { community_id?: string } | undefined)?.community_id;
    if (cid) perCommunity[cid] = (perCommunity[cid] ?? 0) + 1;
  }
  if (Object.values(perCommunity).some((n) => n >= 15) && !badges.find((b) => b.key === "CHAMPION")) {
    badges.push({ key: "CHAMPION", label: "Community Champion", hint: "15 attended in one community" });
  }

  const isSelf = viewer?.id === id;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="glass flex items-start gap-4 rounded-3xl p-6">
        {profile.avatar_url ? (
          <Image src={profile.avatar_url} alt="" width={72} height={72} className="h-18 w-18 rounded-3xl object-cover" />
        ) : (
          <div className="flex h-18 w-18 items-center justify-center rounded-3xl bg-neon-gradient text-2xl font-black text-white">
            {(profile.full_name ?? "M").slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black tracking-tight">{profile.full_name ?? "Member"}</h1>
          <p className="mt-1 text-xs text-muted">
            Member since {new Date(profile.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
            {" · "}{attended} event{attended === 1 ? "" : "s"} attended
          </p>
          {badges.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <span key={b.key} title={b.hint} className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold", BADGE_TONES[b.key])}>
                  {b.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Communities */}
      {communityIds.length ? (
        <section className="space-y-2">
          <h2 className="text-base font-bold">Communities</h2>
          <div className="space-y-1.5">
            {communityIds.map((cid) => {
              const c = commMap[cid];
              if (!c) return null;
              return (
                <Link key={cid} href={`/communities/${cid}`} className="glass flex items-center justify-between rounded-2xl px-4 py-3 hover:border-violet-neon">
                  <span className="text-sm font-semibold">{c.name}</span>
                  <Badge tone="neutral">member</Badge>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Attended events */}
      {attendedEvents?.length ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <CalendarDays className="h-4 w-4 text-violet-neon" />
            Attended events
          </h2>
          <div className="space-y-1.5">
            {attendedEvents.map((t) => {
              const e = eventMap[t.event_id];
              if (!e) return null;
              return (
                <Link key={t.event_id + t.checked_in_at} href={`/events/${e.id}`} className="glass block rounded-2xl px-4 py-3 hover:border-violet-neon">
                  <p className="text-sm font-semibold">{e.title}</p>
                  <p className="text-xs text-muted">{formatDateTime(e.starts_at)} · {cityLabel(e.city)}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {!badges.length && !communityIds.length ? (
        <div className="glass rounded-3xl p-8 text-center">
          <Award className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-2 text-sm text-muted">
            {isSelf ? "Attend your first event to start earning badges." : "No activity yet."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
