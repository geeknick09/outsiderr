import "server-only";

import { createClient } from "../auth/server";
import { createServiceClient } from "../auth/service";
import type { CurrentUser } from "../auth/auth";
import type { Community, CommunityMember, CommunityJoinQuestion, CommunityJoinAnswer, CommunityType, City, JoinMode, MembershipStatus } from "../lib/types";

export interface CreateCommunityInput {
  name: string;
  bio: string;
  type: CommunityType;
  city: City | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  instagramHandle: string | null;
  upiId: string | null;
  membershipType: JoinMode;
  membershipFeePaise: number;
  terms: string[];
}

export async function listCommunities(city?: City): Promise<Community[]> {
  const supabase = await createClient();
  let query = supabase
    .from("communities")
    .select("*")
    .eq("verified", true)
    .order("created_at", { ascending: false });
  if (city) query = query.eq("city", city);

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const ownerIds = [...new Set(data.map((r) => r.owner_id))];
  const { data: owners } = await supabase
    .from("organizers_public")
    .select("id, name")
    .in("id", ownerIds);
  const ownerMap = Object.fromEntries((owners ?? []).map((o) => [o.id, o.name]));

  return data.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    ownerName: ownerMap[row.owner_id] ?? "Organizer",
    name: row.name,
    bio: row.bio,
    type: row.type as CommunityType,
    city: row.city as City | null,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url ?? null,
    galleryUrls: row.gallery_urls ?? [],
    
    instagramHandle: row.instagram_handle,
    upiId: row.upi_id ?? null,
    membershipType: row.membership_type as JoinMode,
    membershipFeePaise: row.membership_fee_paise,
    terms: row.terms ?? [],
    memberCount: row.member_count ?? 0,
    verified: row.verified,
    createdAt: row.created_at,
  }));
}

export async function getCommunity(id: string): Promise<Community | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("communities").select("*").eq("id", id).single();
  if (error || !data) return null;

  const { data: owner } = await supabase
    .from("organizers_public")
    .select("name")
    .eq("id", data.owner_id)
    .single();

  return {
    id: data.id,
    ownerId: data.owner_id,
    ownerName: owner?.name ?? "Organizer",
    name: data.name,
    bio: data.bio,
    type: data.type as CommunityType,
    city: data.city as City | null,
    avatarUrl: data.avatar_url,
    coverUrl: data.cover_url ?? null,
    galleryUrls: data.gallery_urls ?? [],
    
    instagramHandle: data.instagram_handle,
    upiId: data.upi_id ?? null,
    membershipType: data.membership_type as JoinMode,
    membershipFeePaise: data.membership_fee_paise,
    terms: data.terms ?? [],
    memberCount: data.member_count ?? 0,
    verified: data.verified,
    createdAt: data.created_at,
  };
}

export async function createCommunity(
  user: CurrentUser,
  input: CreateCommunityInput,
): Promise<string> {
  // Try to get organizer profile; if none exists, use the user's profile name
  const { getOrganizerProfile } = await import("./organizer-profile");
  const organizer = await getOrganizerProfile(user);

  const supabase = await createClient();

  if (organizer) {
    // Organizer user - link to their organizer profile
    const { data, error } = await supabase
      .from("communities")
      .insert({
        owner_id: organizer.id,
        name: input.name,
        bio: input.bio || null,
        type: input.type,
        city: input.city,
        avatar_url: input.avatarUrl ?? null,
        cover_url: input.coverUrl ?? null,
        instagram_handle: input.instagramHandle,
        upi_id: input.upiId ?? null,
        membership_type: input.membershipType,
        membership_fee_paise: input.membershipFeePaise,
        terms: input.terms,
        verified: false,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  // Non-organizer user: auto-create a minimal organizer record so FK is satisfied
  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: newOrg, error: orgError } = await supabase
    .from("organizers")
    .insert({
      owner_id: user.id,
      name: profileData?.full_name ?? user.email ?? "Community Organizer",
      bio: null,
      upi_id: null,
      avatar_url: profileData?.avatar_url ?? null,
    })
    .select("id")
    .single();
  if (orgError) throw orgError;

  const { data, error } = await supabase
    .from("communities")
    .insert({
      owner_id: newOrg.id,
      name: input.name,
      bio: input.bio || null,
      type: input.type,
      city: input.city,
      avatar_url: input.avatarUrl ?? null,
      cover_url: input.coverUrl ?? null,
      instagram_handle: input.instagramHandle,
      upi_id: input.upiId ?? null,
      membership_type: input.membershipType,
      membership_fee_paise: input.membershipFeePaise,
      terms: input.terms,
      verified: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function getMyMembership(
  user: CurrentUser,
  communityId: string,
): Promise<CommunityMember | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_members")
    .select("*")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return {
    id: data.id,
    communityId: data.community_id,
    userId: data.user_id,
    userName: profile?.full_name ?? user.name,
    status: data.status as CommunityMember["status"],
    instagramLink: data.instagram_link,
    utrReference: data.utr_reference,
    inviteCode: data.invite_code ?? null,
    imported: !!data.imported_from,
    createdAt: data.created_at,
  };
}

export interface JoinCommunityResult {
  memberId: string | null;
  status: "ACCEPTED" | "PENDING";
  existing: boolean;
}

export async function joinCommunity(
  user: CurrentUser,
  communityId: string,
  options: {
    answers?: { questionId: string; answer: string }[];
    inviteToken?: string | null;
    refCode?: string | null;
  } = {},
): Promise<JoinCommunityResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_community", {
    p_user_id: user.id,
    p_community_id: communityId,
    p_answers: (options.answers ?? []).map((a) => ({
      question_id: a.questionId,
      answer: a.answer,
    })),
    p_invite_token: options.inviteToken ?? null,
    p_ref_code: options.refCode ?? null,
  });
  if (error) throw new Error(error.message);
  const row = data as { member_id: string | null; status: "ACCEPTED" | "PENDING"; existing: boolean };
  return { memberId: row.member_id, status: row.status, existing: !!row.existing };
}

export async function listCommunityMembers(communityId: string): Promise<CommunityMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_members")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false });
  if (!data) return [];

  const userIds = [...new Set(data.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  return data.map((row) => ({
    id: row.id,
    communityId,
    userId: row.user_id,
    userName: nameMap[row.user_id] ?? "Member",
    status: row.status as CommunityMember["status"],
    instagramLink: row.instagram_link,
    utrReference: row.utr_reference,
    inviteCode: row.invite_code ?? null,
    imported: !!row.imported_from,
    createdAt: row.created_at,
  }));
}

export async function listMyCommunities(user: CurrentUser): Promise<Community[]> {
  const { getOrganizerProfile } = await import("./organizer-profile");
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("communities")
    .select("*")
    .eq("owner_id", organizer.id)
    .order("created_at", { ascending: false });
  if (!data) return [];

  return data.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    ownerName: organizer.name,
    name: row.name,
    bio: row.bio,
    type: row.type as CommunityType,
    city: row.city as City | null,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url ?? null,
    galleryUrls: row.gallery_urls ?? [],
    
    instagramHandle: row.instagram_handle,
    upiId: row.upi_id ?? null,
    membershipType: row.membership_type as JoinMode,
    membershipFeePaise: row.membership_fee_paise,
    terms: row.terms ?? [],
    memberCount: row.member_count ?? 0,
    verified: row.verified,
    createdAt: row.created_at,
  }));
}

/** Admin: list all unverified communities awaiting approval. */
export async function listPendingCommunities(): Promise<Community[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("communities")
    .select("*")
    .eq("verified", false)
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return [];

  const ownerIds = [...new Set(data.map((r) => r.owner_id))];
  const { data: owners } = await supabase
    .from("organizers_public")
    .select("id, name")
    .in("id", ownerIds);
  const ownerMap = Object.fromEntries((owners ?? []).map((o) => [o.id, o.name]));

  return data.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    ownerName: ownerMap[row.owner_id] ?? "Organizer",
    name: row.name,
    bio: row.bio,
    type: row.type as CommunityType,
    city: row.city as City | null,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url ?? null,
    galleryUrls: row.gallery_urls ?? [],
    
    instagramHandle: row.instagram_handle,
    upiId: row.upi_id ?? null,
    membershipType: row.membership_type as JoinMode,
    membershipFeePaise: row.membership_fee_paise,
    terms: row.terms ?? [],
    memberCount: row.member_count ?? 0,
    verified: false,
    createdAt: row.created_at,
  }));
}

/** Admin: approve or reject a community. */
export async function setCommunityVerified(communityId: string, verified: boolean): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from("communities").update({ verified } as any).eq("id", communityId);
}

export async function updateMemberStatus(
  user: CurrentUser,
  memberId: string,
  status: "ACCEPTED" | "REJECTED",
): Promise<void> {
  // Verify the user owns this community
  const { getOrganizerProfile } = await import("./organizer-profile");
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("Not an organizer.");

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("community_members")
    .select("community_id, status")
    .eq("id", memberId)
    .single();
  if (!member) throw new Error("Member not found.");

  const { data: community } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", member.community_id)
    .single();
  if (!community || community.owner_id !== organizer.id) throw new Error("Not authorised.");

  const { error } = await supabase.from("community_members").update({ status }).eq("id", memberId);
  if (error) throw error;

  if (status === "ACCEPTED" && member.status !== "ACCEPTED") {
    await supabase.rpc("increment_community_member_count", { p_community_id: member.community_id });
  }
}

// ── Community extensions (STEP 45) ─────────────────────────────────────

export async function listJoinQuestions(communityId: string): Promise<CommunityJoinQuestion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_join_questions")
    .select("*")
    .eq("community_id", communityId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((q) => ({
    id: q.id,
    communityId: q.community_id,
    question: q.question,
    isMandatory: q.is_mandatory,
    sortOrder: q.sort_order,
  }));
}

export async function setJoinQuestions(
  communityId: string,
  questions: { question: string; isMandatory: boolean }[],
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("community_join_questions").delete().eq("community_id", communityId);
  if (questions.length === 0) return;
  const rows = questions.map((q, i) => ({
    community_id: communityId,
    question: q.question,
    is_mandatory: q.isMandatory,
    sort_order: i,
  }));
  const { error } = await supabase.from("community_join_questions").insert(rows);
  if (error) throw new Error(error.message);
}

export async function listJoinAnswers(memberId: string): Promise<CommunityJoinAnswer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_join_answers")
    .select("*")
    .eq("member_id", memberId);
  return (data ?? []).map((a) => ({ memberId: a.member_id, question: a.question, answer: a.answer }));
}

/** Richer member list for the organizer: phone/email + stats. */
export interface CommunityMemberDetail extends CommunityMember {
  email: string | null;
  phone: string | null;
  memberSince: string;
  eventsAttended: number; // real attended (USED tickets on this community's events)
  answers: CommunityJoinAnswer[];
}

export async function listCommunityMemberDetails(communityId: string): Promise<CommunityMemberDetail[]> {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("community_members")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false });
  if (!members?.length) return [];

  const userIds = [...new Set(members.map((m) => m.user_id))];
  const memberIds = members.map((m) => m.id);

  const [{ data: profiles }, { data: answers }, { data: attended }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone").in("id", userIds),
    supabase.from("community_join_answers").select("*").in("member_id", memberIds),
    supabase
      .from("tickets")
      .select("user_id, event_id, events!inner(community_id)")
      .eq("events.community_id", communityId)
      .eq("status", "USED")
      .in("user_id", userIds),
  ]);

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
  const answerMap: Record<string, CommunityJoinAnswer[]> = {};
  for (const a of answers ?? []) {
    (answerMap[a.member_id] ??= []).push({ memberId: a.member_id, question: a.question, answer: a.answer });
  }
  const attendedMap: Record<string, Set<string>> = {};
  for (const t of attended ?? []) {
    if (!t.user_id) continue;
    (attendedMap[t.user_id] ??= new Set()).add(t.event_id);
  }

  return members.map((m) => {
    const p = profileMap[m.user_id];
    return {
      id: m.id,
      communityId,
      userId: m.user_id,
      userName: p?.full_name ?? "Member",
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      status: m.status as MembershipStatus,
      instagramLink: m.instagram_link,
      utrReference: m.utr_reference,
      inviteCode: m.invite_code,
      imported: !!m.imported_from,
      memberSince: m.created_at,
      eventsAttended: (attendedMap[m.user_id]?.size ?? 0) + m.imported_events_attended,
      answers: answerMap[m.id] ?? [],
      createdAt: m.created_at,
    };
  });
}

// ── Follows ──────────────────────────────────────────────────────────────

export async function isFollowingCommunity(user: CurrentUser, communityId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_follows")
    .select("community_id")
    .eq("community_id", communityId)
    .eq("follower_id", user.id)
    .maybeSingle();
  return !!data;
}

export async function getCommunityFollowerCount(communityId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("community_follows")
    .select("*", { count: "exact", head: true })
    .eq("community_id", communityId);
  return count ?? 0;
}

/** Distinct followers across organizer + all their communities. */
export async function getOrganizerCombinedFollowerCount(organizerId: string): Promise<number> {
  const supabase = await createClient();
  const [{ data: org }, { data: comm }] = await Promise.all([
    supabase.from("organizer_follows").select("follower_id").eq("organizer_id", organizerId),
    supabase
      .from("community_follows")
      .select("follower_id, communities!inner(owner_id)")
      .eq("communities.owner_id", organizerId),
  ]);
  return new Set([...(org ?? []).map((r) => r.follower_id), ...(comm ?? []).map((r) => r.follower_id)]).size;
}

export async function listFollowedCommunities(user: CurrentUser): Promise<Community[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_follows")
    .select("community_id")
    .eq("follower_id", user.id);
  const ids = (data ?? []).map((r) => r.community_id);
  if (!ids.length) return [];
  const { data: comms } = await supabase.from("communities").select("*").in("id", ids);
  return (comms ?? []).map((row) => ({
    id: row.id, ownerId: row.owner_id, ownerName: "", name: row.name, bio: row.bio,
    type: row.type as CommunityType, city: row.city as City | null,
    avatarUrl: row.avatar_url, coverUrl: row.cover_url ?? null,
    galleryUrls: row.gallery_urls ?? [], 
    instagramHandle: row.instagram_handle, upiId: row.upi_id ?? null,
    membershipType: row.membership_type as JoinMode, membershipFeePaise: row.membership_fee_paise,
    terms: row.terms ?? [], memberCount: row.member_count ?? 0, verified: row.verified,
    createdAt: row.created_at,
  }));
}

/** Community events for the landing calendar — public: only PUBLISHED, non-invite-only. */
export interface CommunityEventItem {
  id: string;
  title: string;
  startsAt: string;
  venueName: string;
  city: string;
  visibility: string;
  status: string;
}

export async function listCommunityEvents(communityId: string): Promise<CommunityEventItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at, venue_name, city, visibility, status")
    .eq("community_id", communityId)
    .neq("visibility", "INVITE_ONLY")
    .neq("status", "CANCELLED")
    .order("starts_at", { ascending: true });
  return (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    venueName: e.venue_name,
    city: e.city,
    visibility: e.visibility ?? "OPEN",
    status: e.status,
  }));
}

export interface CommunityAnalytics {
  total_members: number;
  new_members_30d: number;
  pending_requests: number;
  events_total: number;
  attendees: number;
  repeat_attendees: number;
  views: number;
  followers: number;
}

/** Owner/admin rollup for one community (service-side RPC). */
export async function getCommunityAnalytics(communityId: string): Promise<CommunityAnalytics | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase.rpc("community_analytics", { p_community_id: communityId });
  return (data as CommunityAnalytics | null) ?? null;
}
