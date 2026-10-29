"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

import { cn } from "../../lib/utils";

function PendingSpinner() {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="h-3 w-3 animate-spin" aria-label="Loading" /> : null;
}

/**
 * Tab pill that shows a spinner inside itself while its navigation resolves.
 * loading.tsx does NOT fire for same-page ?tab= changes - useLinkStatus is the
 * only signal for those, so every in-page tab switch gets visible feedback.
 */
export function TabLink({
  href,
  active,
  children,
  className,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-colors",
        active
          ? "bg-violet-neon text-white"
          : "border border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10",
        className,
      )}
    >
      <PendingSpinner />
      {children}
    </Link>
  );
}
