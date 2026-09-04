import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import type { Club, ClubMember, ClubType, City, MembershipType } from "@/lib/types";

export interface CreateClubInput {
  name: string;
  bio: string;
  type: ClubType;
  city: City | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  instagramHandle: string | null;
  upiId: string | null;
  membershipType: MembershipType;
  membershipFeePaise: number;
  terms: string[];
}

export async function listClubs(city?: City): Promise<Club[]> {
  const supabase = await createClient();
  let query = supabase
    .from("clubs")
    .select("*")
    .eq("verified", true)
    .order("created_at", { ascending: false });
  if (city) query = query.eq("city", city);

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const ownerIds = [...new Set(data.map((r) => r.owner_id))];
  const { data: owners } = await supabase
    .from("organizers")
    .select("id, name")
    .in("id", ownerIds);
  const ownerMap = Object.fromEntries((owners ?? []).map((o) => [o.id, o.name]));

  return data.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    ownerName: ownerMap[row.owner_id] ?? "Organizer",
    name: row.name,
    bio: row.bio,
    type: row.type as ClubType,
    city: row.city as City | null,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url ?? null,
    instagramHandle: row.instagram_handle,
    upiId: row.upi_id ?? null,
    membershipType: row.membership_type as MembershipType,
    membershipFeePaise: row.membership_fee_paise,
    terms: row.terms ?? [],
    memberCount: row.member_count ?? 0,
    verified: row.verified,
    createdAt: row.created_at,
  }));
}

export async function getClub(id: string): Promise<Club | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clubs").select("*").eq("id", id).single();
  if (error || !data) return null;

  const { data: owner } = await supabase
    .from("organizers")
    .select("name")
    .eq("id", data.owner_id)
    .single();

  return {
    id: data.id,
    ownerId: data.owner_id,
    ownerName: owner?.name ?? "Organizer",
    name: data.name,
    bio: data.bio,
    type: data.type as ClubType,
    city: data.city as City | null,
    avatarUrl: data.avatar_url,
    coverUrl: data.cover_url ?? null,
    instagramHandle: data.instagram_handle,
    upiId: data.upi_id ?? null,
    membershipType: data.membership_type as MembershipType,
    membershipFeePaise: data.membership_fee_paise,
    terms: data.terms ?? [],
    memberCount: data.member_count ?? 0,
    verified: data.verified,
    createdAt: data.created_at,
  };
}

export async function createClub(
  user: CurrentUser,
  input: CreateClubInput,
): Promise<string> {
  // Try to get organizer profile; if none exists, use the user's profile name
  const { getOrganizerProfile } = await import("@/lib/data/organizer");
  const organizer = await getOrganizerProfile(user);

  const supabase = await createClient();

  if (organizer) {
    // Organizer user — link to their organizer profile
    const { data, error } = await supabase
      .from("clubs")
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
    .from("clubs")
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
  clubId: string,
): Promise<ClubMember | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("club_members")
    .select("*")
    .eq("club_id", clubId)
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
    clubId: data.club_id,
    userId: data.user_id,
    userName: profile?.full_name ?? user.name,
    status: data.status as ClubMember["status"],
    instagramLink: data.instagram_link,
    utrReference: data.utr_reference,
    createdAt: data.created_at,
  };
}

export async function joinClub(
  user: CurrentUser,
  clubId: string,
  options: { instagramLink?: string; utrReference?: string },
): Promise<void> {
  const supabase = await createClient();

  // Check if already a member
  const { data: existing } = await supabase
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return;

  // Get the club to determine status
  const { data: club } = await supabase
    .from("clubs")
    .select("membership_type")
    .eq("id", clubId)
    .single();
  if (!club) throw new Error("Club not found.");

  const status = club.membership_type === "FREE" ? "ACCEPTED" : "PENDING";

  const { error } = await supabase.from("club_members").insert({
    club_id: clubId,
    user_id: user.id,
    status,
    instagram_link: options.instagramLink ?? null,
    utr_reference: options.utrReference ?? null,
  });

  // Handle unique constraint violation (concurrent join requests)
  if (error) {
    if ((error as { code?: string }).code === "23505") return; // already a member
    throw error;
  }

  // Increment member count if accepted
  if (status === "ACCEPTED") {
    await supabase.rpc("increment_club_member_count", { p_club_id: clubId });
  }
}

export async function listClubMembers(clubId: string): Promise<ClubMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("club_members")
    .select("*")
    .eq("club_id", clubId)
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
    clubId,
    userId: row.user_id,
    userName: nameMap[row.user_id] ?? "Member",
    status: row.status as ClubMember["status"],
    instagramLink: row.instagram_link,
    utrReference: row.utr_reference,
    createdAt: row.created_at,
  }));
}

export async function listMyClubs(user: CurrentUser): Promise<Club[]> {
  const { getOrganizerProfile } = await import("@/lib/data/organizer");
  const organizer = await getOrganizerProfile(user);
  if (!organizer) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("clubs")
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
    type: row.type as ClubType,
    city: row.city as City | null,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url ?? null,
    instagramHandle: row.instagram_handle,
    upiId: row.upi_id ?? null,
    membershipType: row.membership_type as MembershipType,
    membershipFeePaise: row.membership_fee_paise,
    terms: row.terms ?? [],
    memberCount: row.member_count ?? 0,
    verified: row.verified,
    createdAt: row.created_at,
  }));
}

/** Admin: list all unverified clubs awaiting approval. */
export async function listPendingClubs(): Promise<Club[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clubs")
    .select("*")
    .eq("verified", false)
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return [];

  const ownerIds = [...new Set(data.map((r) => r.owner_id))];
  const { data: owners } = await supabase
    .from("organizers")
    .select("id, name")
    .in("id", ownerIds);
  const ownerMap = Object.fromEntries((owners ?? []).map((o) => [o.id, o.name]));

  return data.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    ownerName: ownerMap[row.owner_id] ?? "Organizer",
    name: row.name,
    bio: row.bio,
    type: row.type as ClubType,
    city: row.city as City | null,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url ?? null,
    instagramHandle: row.instagram_handle,
    upiId: row.upi_id ?? null,
    membershipType: row.membership_type as MembershipType,
    membershipFeePaise: row.membership_fee_paise,
    terms: row.terms ?? [],
    memberCount: row.member_count ?? 0,
    verified: false,
    createdAt: row.created_at,
  }));
}

/** Admin: approve or reject a club. */
export async function setClubVerified(clubId: string, verified: boolean): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from("clubs").update({ verified } as any).eq("id", clubId);
}

export async function updateMemberStatus(
  user: CurrentUser,
  memberId: string,
  status: "ACCEPTED" | "REJECTED",
): Promise<void> {
  // Verify the user owns this club
  const { getOrganizerProfile } = await import("@/lib/data/organizer");
  const organizer = await getOrganizerProfile(user);
  if (!organizer) throw new Error("Not an organizer.");

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("club_members")
    .select("club_id, status")
    .eq("id", memberId)
    .single();
  if (!member) throw new Error("Member not found.");

  const { data: club } = await supabase
    .from("clubs")
    .select("owner_id")
    .eq("id", member.club_id)
    .single();
  if (!club || club.owner_id !== organizer.id) throw new Error("Not authorised.");

  const { error } = await supabase.from("club_members").update({ status }).eq("id", memberId);
  if (error) throw error;

  if (status === "ACCEPTED" && member.status !== "ACCEPTED") {
    await supabase.rpc("increment_club_member_count", { p_club_id: member.club_id });
  }
}
