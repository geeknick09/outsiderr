"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ThemePreference } from "@/lib/types";

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** Persists the theme toggle to `profiles.theme_preference` for signed-in users. */
export async function saveThemePreferenceAction(
  theme: ThemePreference,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createClient();
  await supabase.from("profiles").update({ theme_preference: theme }).eq("id", user.id);
}
