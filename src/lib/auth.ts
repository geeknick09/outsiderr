import "server-only";

import { cookies } from "next/headers";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const DEMO_USER_COOKIE = "outsiderr_demo_user";

export interface CurrentUser {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isDemo: boolean;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured()) {
    const raw = (await cookies()).get(DEMO_USER_COOKIE)?.value;
    if (!raw) return null;
    const [name, phone] = decodeURIComponent(raw).split("|");
    return {
      id: "demo-user",
      name: name || "Demo Outsider",
      phone: phone || null,
      email: null,
      isDemo: true,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    name: profile?.full_name ?? user.user_metadata?.full_name ?? "Outsider",
    phone: profile?.phone ?? user.phone ?? null,
    email: user.email ?? null,
    isDemo: false,
  };
}
