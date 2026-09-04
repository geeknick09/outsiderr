import Link from "next/link";
import { Suspense } from "react";

import { LocationSelector } from "@/components/layout/location-selector";
import { ThemeLogo } from "@/components/layout/theme-logo";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizerProfile } from "@/lib/data/organizer";
import { createClient } from "@/lib/supabase/server";

export async function Navbar() {
  const user = await getCurrentUser();

  let isAdmin = false;
  let isOrganizer = false;
  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, is_organizer")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = profile?.is_admin === true;
    // Check is_organizer flag first, then fall back to organizers table lookup
    // This handles cases where the flag wasn't set but the organizer profile exists
    isOrganizer = profile?.is_organizer === true;
    if (!isOrganizer) {
      const organizer = await getOrganizerProfile(user);
      isOrganizer = !!organizer;
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-zinc-50/80 backdrop-blur-xl dark:border-white/10 dark:bg-ink/80">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 overflow-x-hidden px-4 sm:gap-3">
        <Link href="/" className="flex items-center gap-2">
          <ThemeLogo width={140} height={32} />
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
