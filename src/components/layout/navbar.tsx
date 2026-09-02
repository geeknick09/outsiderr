import Link from "next/link";
import { Suspense } from "react";

import { LocationSelector } from "@/components/layout/location-selector";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizerProfile } from "@/lib/data/organizer";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function Navbar() {
  const user = await getCurrentUser();

  let isAdmin = false;
  let isOrganizer = false;
  if (user) {
    if (!isSupabaseConfigured()) {
      // Demo mode: treat every signed-in user as admin so they can explore.
      isAdmin = true;
      // Check organizer cookie
      const organizer = await getOrganizerProfile(user);
      isOrganizer = !!organizer;
    } else {
      const supabase = await createClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, is_organizer")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = profile?.is_admin === true;
      isOrganizer = profile?.is_organizer === true;
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-zinc-50/80 backdrop-blur-xl dark:border-white/10 dark:bg-ink/80">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="bg-neon-gradient bg-clip-text text-lg font-black tracking-[0.2em] text-transparent">
            OUTSIDERR
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Suspense fallback={<div className="glass h-10 w-10 rounded-full sm:w-28" />}>
            <LocationSelector />
          </Suspense>
          <ThemeToggle />
          <UserMenu name={user?.name ?? null} isAdmin={isAdmin} isOrganizer={isOrganizer} />
        </div>
      </nav>
    </header>
  );
}
