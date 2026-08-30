import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type BadgeTone = "violet" | "pink" | "lime" | "neutral" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, string> = {
  violet: "bg-violet-neon/15 text-violet-600 dark:text-violet-300 border-violet-neon/40",
  pink: "bg-pink-neon/15 text-pink-600 dark:text-pink-300 border-pink-neon/40",
  lime: "bg-lime-neon/20 text-lime-700 dark:text-lime-neon border-lime-neon/50",
  neutral:
    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:border-white/10",
  success:
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/40",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40",
  danger: "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/40",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
