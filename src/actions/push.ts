"use server";

import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function subscribePushAction(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  // Demo mode: no persistence
  if (!isSupabaseConfigured()) return;

  const supabase = await createClient();
  await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
    { onConflict: "endpoint" },
  );
}

export async function unsubscribePushAction(endpoint: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  if (!isSupabaseConfigured()) return;

  const supabase = await createClient();
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);
}
