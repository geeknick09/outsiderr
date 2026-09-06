import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";
import type { UserProfile } from "@/lib/types";

export async function getUserProfile(
  user: CurrentUser,
): Promise<UserProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, phone, avatar_url, birth_date, gender, interested_tags, instagram_url, youtube_url, x_url, facebook_url, linkedin_url")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    fullName: data.full_name,
    phone: data.phone,
    email: user.email,
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

  const supabase = await createClient();
  // Read current tags
  const { data } = await supabase
    .from("profiles")
    .select("interested_tags")
    .eq("id", user.id)
    .maybeSingle();

  const existing = new Set(data?.interested_tags ?? []);
  for (const tag of tags) existing.add(tag);
  const merged = [...existing];

  await supabase
    .from("profiles")
    .update({ interested_tags: merged })
    .eq("id", user.id);
}
