import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isDemo: boolean;
  birthDate: string | null;
  gender: string | null;
  interestedTags: string[];
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, birth_date, gender, interested_tags")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    name: profile?.full_name ?? user.user_metadata?.full_name ?? "Outsider",
    phone: profile?.phone ?? user.phone ?? null,
    email: user.email ?? null,
    isDemo: false,
    birthDate: profile?.birth_date ?? null,
    gender: (profile as { gender?: string | null })?.gender ?? null,
    interestedTags: profile?.interested_tags ?? [],
  };
}
