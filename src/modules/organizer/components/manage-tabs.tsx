"use client";

import { useState } from "react";
import { cn } from "@/modules/shared";

interface ManageTabsProps {
  tabs: { id: string; label: string; content: React.ReactNode }[];
  defaultTab?: string;
}

/** Top-level view tabs for the manage page - Analytics, Attendees etc. */
export function ManageTabs({ tabs, defaultTab }: ManageTabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-white/10" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              active === t.id
                ? "border-violet-neon text-violet-neon"
                : "border-transparent text-muted hover:text-zinc-900 dark:hover:text-zinc-100",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" className={active === t.id ? "pt-5" : "hidden"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
