"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function CategoryFilter({ active }: { active: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") params.delete("category");
    else params.set("category", value);
    const query = params.toString();
    router.push(query ? `/?${query}` : "/", { scroll: false });
  }

  return (
    <div className="sticky top-16 z-30 -mx-4 mb-6 border-b border-zinc-200 bg-zinc-50/90 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-ink/90">
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {CATEGORIES.map((category) => {
            const isActive = category.value === active;
            return (
              <button
                key={category.value}
                type="button"
                onClick={() => select(category.value)}
                aria-pressed={isActive}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200",
                  isActive
                    ? "border-transparent bg-neon-gradient text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-violet-neon/50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300",
                )}
              >
                {category.label}
              </button>
            );
          })}
        </div>

        {/* Clubs & Crews — pushed to the right, navigates to its own page */}
        <Link
          href="/clubs"
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-violet-neon/40 bg-violet-neon/10 px-4 py-2 text-sm font-bold text-violet-neon transition-all duration-200 hover:border-violet-neon hover:bg-violet-neon/20"
        >
          <Users className="h-3.5 w-3.5" />
          Join a club/crew
        </Link>
      </div>
    </div>
  );
}
