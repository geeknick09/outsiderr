"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DEMO_USER_COOKIE, getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ThemePreference } from "@/lib/types";

export interface ActionState {
  error: string | null;
}

/** Demo-mode sign in: no Supabase project configured, so we stash a cookie. */
export async function demoSignInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  if (!email || !password) return { error: "Enter your email and password." };

  (await cookies()).set(
    DEMO_USER_COOKIE,
    encodeURIComponent(email),
    { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 },
  );

  redirect(String(formData.get("next") || "/"));
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } else {
    (await cookies()).delete(DEMO_USER_COOKIE);
  }
  redirect("/");
}

/** Persists the theme toggle to `profiles.theme_preference` for signed-in users. */
export async function saveThemePreferenceAction(
  theme: ThemePreference,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createClient();
  await supabase.from("profiles").update({ theme_preference: theme }).eq("id", user.id);
}
