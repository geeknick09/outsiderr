"use client";

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
                  ? "border-transparent bg-neon-gradient text-white shadow-glow-violet"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-violet-neon/50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300",
              )}
            >
              {category.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
