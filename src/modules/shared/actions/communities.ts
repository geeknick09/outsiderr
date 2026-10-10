"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser, getAuthUserId } from "../auth/auth";
import {
  createCommunity,
  joinCommunity,
  updateMemberStatus,
  setJoinQuestions,
  type CreateCommunityInput,
} from "../data/communities";
import { createClient } from "../auth/server";
import { createServiceClient } from "../auth/service";
import { CommunityType, JoinMode } from "../lib/types";
import { normalizeCityKey } from "../lib/india-cities";

export interface CreateCommunityState {
  error: string | null;
}

export async function createCommunityAction(
  _prev: CreateCommunityState,
  formData: FormData,
): Promise<CreateCommunityState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fcommunities%2Fcreate");


  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give your community a name." };

  const membershipType = String(formData.get("membershipType") ?? "OPEN") as JoinMode;
  if (!["OPEN", "PRIVATE", "INVITE_ONLY"].includes(membershipType)) {
    return { error: "Pick how people join your community." };
  }

  const terms = String(formData.get("terms") ?? "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  // Join questions come as a JSON array from the form's question builder.
  let questions: { question: string; isMandatory: boolean }[] = [];
  try {
    questions = JSON.parse(String(formData.get("questions") ?? "[]"));
  } catch { /* ignore malformed */ }

  const input: CreateCommunityInput = {
    name,
    bio: String(formData.get("bio") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || null,
    type: String(formData.get("type") ?? "CLUB") as CommunityType,
    city: String(formData.get("city") ?? "").trim()
      ? normalizeCityKey(String(formData.get("city")))
      : null,
    avatarUrl: String(formData.get("avatarUrl") ?? "").trim() || null,
    coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
    instagramHandle: String(formData.get("instagramHandle") ?? "").trim() || null,
    youtubeUrl: String(formData.get("youtubeUrl") ?? "").trim() || null,
    xUrl: String(formData.get("xUrl") ?? "").trim() || null,
    linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim() || null,
    facebookUrl: String(formData.get("facebookUrl") ?? "").trim() || null,
    websiteUrl: String(formData.get("websiteUrl") ?? "").trim() || null,
    upiId: null,
    membershipType,
    membershipFeePaise: 0,
    terms,
  };

  let communityId: string;
  try {
    communityId = await createCommunity(user, input);
    if (membershipType === "PRIVATE" && questions.length) {
      await setJoinQuestions(communityId, questions.slice(0, 10));
    }
    if (membershipType === "INVITE_ONLY") {
      // rotating invite token = the community's invite link slug
      const supabase = createServiceClient();
      const token = crypto.randomUUID().slice(0, 8);
      await supabase.from("community_invites").upsert({ community_id: communityId, token }, { onConflict: "community_id" });
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not create community.",
    };
  }

  revalidatePath("/communities");
  redirect("/communities?submitted=1");
}

export async function joinCommunityAction(
  communityId: string,
  options: {
    answers?: { questionId: string; answer: string }[];
    inviteToken?: string | null;
    refCode?: string | null;
  } = {},
): Promise<{ memberId: string | null; status: "ACCEPTED" | "PENDING"; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const result = await joinCommunity(user, communityId, options);
    revalidatePath(`/communities/${communityId}`);
    return result;
  } catch (error) {
    return { memberId: null, status: "PENDING", error: error instanceof Error ? error.message : "Could not join." };
  }
}

export async function followCommunityAction(
  communityId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: "Please log in to follow communities." };
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("community_follows")
    .upsert({ community_id: communityId, follower_id: userId }, { onConflict: "community_id,follower_id" });
  if (error) return { error: error.message };
  revalidatePath(`/communities/${communityId}`);
  return { error: null };
}

export async function unfollowCommunityAction(
  communityId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: "Please log in." };
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("community_follows")
    .delete()
    .eq("community_id", communityId)
    .eq("follower_id", userId);
  if (error) return { error: error.message };
  revalidatePath(`/communities/${communityId}`);
  return { error: null };
}

export async function setMemberStatusAction(
  memberId: string,
  communityId: string,
  status: "ACCEPTED" | "REJECTED",
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("set_community_membership", {
    p_actor_id: user.id,
    p_member_id: memberId,
    p_status: status,
  });
  if (error) return { error: error.message };
  revalidatePath("/organizer/communities");
  revalidatePath(`/communities/${communityId}`);
  return {};
}

export async function acceptMemberAction(memberId: string, communityId: string): Promise<void> {
  await setMemberStatusAction(memberId, communityId, "ACCEPTED");
}

export async function rejectMemberAction(memberId: string, communityId: string): Promise<void> {
  await setMemberStatusAction(memberId, communityId, "REJECTED");
}

// Legacy shim — kept for any stale callers; updateMemberStatus still enforces ownership.
export { updateMemberStatus };

/** Fire-and-forget page view log for logged-in users. */
export async function logPageViewAction(entityType: "COMMUNITY" | "EVENT", entityId: string): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) return;
  const supabase = await createClient();
  await supabase.rpc("log_page_view", { p_entity_type: entityType, p_entity_id: entityId });
}

/** Organizer stages a CSV/Excel member import for admin approval. */
export async function requestMemberImportAction(
  communityId: string,
  filename: string,
  items: { name: string; phone?: string; email?: string; events_attended?: number }[],
): Promise<{ importId?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in." };
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("request_member_import", {
    p_actor_id: user.id,
    p_community_id: communityId,
    p_filename: filename,
    p_items: items,
  });
  if (error) return { error: error.message };
  revalidatePath(`/organizer/communities/${communityId}`);
  return { importId: data };
}

/** Organizer sends an in-app notification to a chosen user set (non-joiners / non-buyers). */
export async function sendOutreachBlastAction(
  entityType: "COMMUNITY" | "EVENT",
  entityId: string,
  message: string,
  userIds: string[],
): Promise<{ sent?: number; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in." };
  if (!message.trim()) return { error: "Write a message first." };
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("send_outreach_blast", {
    p_actor_id: user.id,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_message: message.trim().slice(0, 500),
    p_user_ids: userIds,
  });
  if (error) return { error: error.message };
  revalidatePath("/organizer/analytics");
  return { sent: data ?? 0 };
}

// ── Guestlist ──────────────────────────────────────────────────────────

/** Organizer adds a free guest — creates a VALID ticket + shareable /guest link. */
export async function addGuestEntryAction(
  eventId: string,
  name: string,
  phone: string | null,
  email: string | null,
): Promise<{ ticketId?: string; link?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in." };
  if (!name.trim()) return { error: "Guest needs a name." };
  if (!phone?.trim() && !email?.trim()) return { error: "Add a phone number or email." };

  const supabase = createServiceClient();
  const { data: ticketId, error } = await supabase.rpc("create_guestlist_entry", {
    p_actor_id: user.id,
    p_event_id: eventId,
    p_name: name.trim(),
    p_phone: phone?.trim() || null,
    p_email: email?.trim() || null,
  });
  if (error) return { error: error.message };

  const { data: ticket } = await supabase
    .from("tickets")
    .select("qr_hash")
    .eq("id", ticketId)
    .single();
  revalidatePath(`/organizer/events/${eventId}`);
  return { ticketId, link: ticket ? `/guest/${ticket.qr_hash}` : undefined };
}

export interface GuestlistEntry {
  ticketId: string;
  name: string;
  phone: string | null;
  email: string | null;
  used: boolean;
  link: string;
}

export async function listGuestlist(eventId: string): Promise<GuestlistEntry[]> {
  const supabase = createServiceClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, buyer_name, buyer_phone, buyer_email")
    .eq("event_id", eventId)
    .eq("order_source", "GUESTLIST");
  if (!orders?.length) return [];
  const orderMap = Object.fromEntries(orders.map((o) => [o.id, o]));
  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, status, qr_hash, order_id")
    .in("order_id", orders.map((o) => o.id));
  return (tickets ?? []).map((t) => {
    const o = orderMap[t.order_id];
    return {
      ticketId: t.id,
      name: o?.buyer_name ?? "Guest",
      phone: o?.buyer_phone ?? null,
      email: o?.buyer_email ?? null,
      used: t.status === "USED",
      link: `/guest/${t.qr_hash}`,
    };
  });
}

// ── Admin: import review ──────────────────────────────────────────────────

export async function adminApproveImportAction(importId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("review_member_import", {
    p_admin_id: user.id, p_import_id: importId, p_approve: true,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/community-imports");
  return {};
}

export async function adminRejectImportAction(importId: string, note?: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("review_member_import", {
    p_admin_id: user.id, p_import_id: importId, p_approve: false, p_note: note ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/community-imports");
  return {};
}
