import "server-only";

import { createClient } from "../auth/server";
import { createServiceClient } from "../auth/service";
import type { CurrentUser } from "../auth/auth";
import type { UserProfile } from "../lib/types";

export async function getUserProfile(
  user: CurrentUser,
): Promise<UserProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, avatar_url, birth_date, gender, interested_tags, instagram_url, youtube_url, x_url, facebook_url, linkedin_url")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    fullName: data.full_name,
    email: (data as { email?: string | null }).email ?? user.email,
    phone: data.phone,
    avatarUrl: data.avatar_url,
    birthDate: data.birth_date,
    gender: (data as { gender?: string | null }).gender ?? null,
    interestedTags: data.interested_tags ?? [],
    instagramUrl: (data as { instagram_url?: string | null }).instagram_url ?? null,
    youtubeUrl: (data as { youtube_url?: string | null }).youtube_url ?? null,
    xUrl: (data as { x_url?: string | null }).x_url ?? null,
    facebookUrl: (data as { facebook_url?: string | null }).facebook_url ?? null,
    linkedinUrl: (data as { linkedin_url?: string | null }).linkedin_url ?? null,
  };
}

export interface UpdateProfileInput {
  fullName?: string;
  phone?: string;
  birthDate?: string | null;
  gender?: string | null;
  interestedTags?: string[];
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  xUrl?: string | null;
  facebookUrl?: string | null;
  linkedinUrl?: string | null;
  avatarUrl?: string | null;
}

export async function updateUserProfile(
  user: CurrentUser,
  input: UpdateProfileInput,
): Promise<void> {
  const update: Record<string, string | string[] | null> = {};
  if (input.fullName !== undefined) update.full_name = input.fullName;
  if (input.phone !== undefined) update.phone = input.phone;
  if (input.birthDate !== undefined) update.birth_date = input.birthDate;
  if (input.gender !== undefined) update.gender = input.gender;
  if (input.interestedTags !== undefined)
    update.interested_tags = input.interestedTags;
  if (input.instagramUrl !== undefined) update.instagram_url = input.instagramUrl;
  if (input.youtubeUrl !== undefined) update.youtube_url = input.youtubeUrl;
  if (input.xUrl !== undefined) update.x_url = input.xUrl;
  if (input.facebookUrl !== undefined) update.facebook_url = input.facebookUrl;
  if (input.linkedinUrl !== undefined) update.linkedin_url = input.linkedinUrl;
  if (input.avatarUrl !== undefined) update.avatar_url = input.avatarUrl;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(update as any)
    .eq("id", user.id);
  if (error) throw error;
}

/**
 * Merge tags into the user's interested_tags array (no duplicates).
 * Called automatically after a user books an event.
 */
export async function addInterestedTags(
  user: CurrentUser,
  tags: string[],
): Promise<void> {
  if (tags.length === 0) return;

  // Service client: this is a system bookkeeping write after booking - it must
  // not silently no-op when the caller lacks a profiles row or column grants.
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("interested_tags")
    .eq("id", user.id)
    .maybeSingle();

  const existing = new Set(data?.interested_tags ?? []);
  for (const tag of tags) existing.add(tag);
  const merged = [...existing];

  // Upsert creates the profiles row when the signup trigger missed it.
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, interested_tags: merged });
  if (error) throw error;
}

export interface EarnedBadge {
  key: string;
  label: string;
  hint: string;
  communityName: string | null;
  earnedAt: string | null;
}

/** Badge detail rows for the tickets page: which badge, in which community,
 *  earned on which date, and why. */
export async function getUserBadgeDetails(userId: string): Promise<EarnedBadge[]> {
  const service = createServiceClient();
  const [{ data: used }, { data: myMemberships }, { data: comms }] = await Promise.all([
    service.from("tickets")
      .select("id, event_id, checked_in_at")
      .eq("user_id", userId).eq("status", "USED")
      .order("checked_in_at", { ascending: true }),
    service.from("community_members")
      .select("id, community_id, created_at")
      .eq("user_id", userId).eq("status", "ACCEPTED"),
    service.from("communities").select("id, name, created_at"),
  ]);
  const commName = new Map((comms ?? []).map((c) => [c.id, c.name]));
  const commCreated = new Map((comms ?? []).map((c) => [c.id, c.created_at]));

  const eventIds = [...new Set((used ?? []).map((t) => t.event_id))];
  const { data: evs } = eventIds.length
    ? await service.from("events").select("id, community_id").in("id", eventIds)
    : { data: [] };
  const evComm = new Map((evs ?? []).map((e) => [e.id, e.community_id]));

  // attendance timeline
  const attended = (used ?? []).map((t) => ({
    at: t.checked_in_at as string | null,
    comm: evComm.get(t.event_id) ?? null,
  })).filter((a) => a.at);
  const total = attended.length;

  // per-community counts + the date the Nth attendance happened
  const perComm = new Map<string, { count: number; dates: string[] }>();
  for (const a of attended) {
    if (!a.comm) continue;
    const e = perComm.get(a.comm) ?? { count: 0, dates: [] };
    e.count += 1; e.dates.push(a.at!);
    perComm.set(a.comm, e);
  }

  // referrals per community (members who joined via my member invite)
  const myMemberIds = (myMemberships ?? []).map((m) => m.id);
  const { data: referred } = myMemberIds.length
    ? await service.from("community_members")
        .select("community_id, referred_by_member_id, created_at")
        .in("referred_by_member_id", myMemberIds)
        .order("created_at", { ascending: true })
    : { data: [] };
  const refByMember = new Map<string, { commId: string; dates: string[] }>();
  for (const m of myMemberships ?? []) refByMember.set(m.id, { commId: m.community_id, dates: [] });
  for (const r of referred ?? []) {
    if (r.referred_by_member_id && r.created_at) refByMember.get(r.referred_by_member_id)?.dates.push(r.created_at);
  }

  const out: EarnedBadge[] = [];
  const nthAt = (n: number) => attended[n - 1]?.at ?? null;
  if (total >= 1) out.push({ key: "FIRST_EVENT", label: "First Event", hint: "Attended your first event", communityName: attended[0]?.comm ? commName.get(attended[0].comm!) ?? null : null, earnedAt: nthAt(1) });
  if (total >= 3) out.push({ key: "REGULAR", label: "Regular", hint: "Attended 3 events", communityName: attended[2]?.comm ? commName.get(attended[2].comm!) ?? null : null, earnedAt: nthAt(3) });
  if (total >= 5) out.push({ key: "FIVE_STRONG", label: "5 Events Strong", hint: "Attended 5 events", communityName: attended[4]?.comm ? commName.get(attended[4].comm!) ?? null : null, earnedAt: nthAt(5) });
  if (total >= 10) out.push({ key: "TEN_STRONG", label: "10 Events Strong", hint: "Attended 10 events", communityName: attended[9]?.comm ? commName.get(attended[9].comm!) ?? null : null, earnedAt: nthAt(10) });
  for (const [commId, v] of perComm) {
    if (v.count >= 15) {
      out.push({ key: "CHAMPION", label: "Community Champion", hint: "15 events attended in one community", communityName: commName.get(commId) ?? null, earnedAt: v.dates[14] ?? null });
    }
  }
  for (const m of myMemberships ?? []) {
    const created = commCreated.get(m.community_id);
    if (created && m.created_at && (new Date(m.created_at).getTime() - new Date(created).getTime()) <= 30 * 86400000) {
      out.push({ key: "FOUNDING", label: "Founding Member", hint: "Joined within the community's first 30 days", communityName: commName.get(m.community_id) ?? null, earnedAt: m.created_at });
    }
  }
  for (const [, v] of refByMember) {
    if (v.dates.length >= 3) {
      out.push({ key: "CONNECTOR", label: "Connector", hint: "Brought 3+ members via your invite link", communityName: commName.get(v.commId) ?? null, earnedAt: v.dates[2] ?? null });
    }
  }
  return out;
}
