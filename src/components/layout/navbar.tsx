import Link from "next/link";
import { Suspense } from "react";

import { LocationSelector } from "@/components/layout/location-selector";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getCurrentUser } from "@/lib/auth";

export async function Navbar() {
  const user = await getCurrentUser();

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
          <UserMenu name={user?.name ?? null} />
        </div>
      </nav>
    </header>
  );
}
