import "server-only";

import { cookies } from "next/headers";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const DEMO_USER_COOKIE = "outsiderr_demo_user";
export const DEMO_ORGANIZER_COOKIE = "outsiderr_demo_organizer";

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
    const email = decodeURIComponent(raw);
    const name = email.split("@")[0] || "Demo Outsider";
    const id = `demo-${email.toLowerCase()}`;
    // Track this user in the demo store so admin can see all users
    const { demoStore } = await import("@/lib/data/demo-store");
    const store = demoStore();
    if (!store.users.find((u) => u.id === id)) {
      store.users.push({
        id,
        fullName: name,
        phone: null,
        avatarUrl: null,
        isOrganizer: false,
        isAdmin: false,
        createdAt: new Date().toISOString(),
      });
    }
    return {
      id,
      name,
      phone: null,
      email,
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
