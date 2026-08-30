import { redirect } from "next/navigation";

import { LoginPanel } from "@/components/auth/login-panel";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = next && next.startsWith("/") ? next : "/";

  if (await getCurrentUser()) redirect(target);

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-3xl font-black tracking-tight">Log in to Outsiderr</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Book tickets, manage events and check people in at the door.
      </p>
      <div className="glass rounded-3xl p-6">
        <LoginPanel supabaseEnabled={isSupabaseConfigured()} next={target} />
      </div>
    </div>
  );
}
