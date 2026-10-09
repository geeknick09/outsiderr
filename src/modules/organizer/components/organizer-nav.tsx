"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/organizer", label: "My Events", exact: true },
  { href: "/organizer/create", label: "Create Event" },
  { href: "/organizer/analytics", label: "Analytics" },
  { href: "/organizer/communities", label: "Communities" },
  { href: "/organizer/payments", label: "Payments" },
  { href: "/organizer/refunds", label: "Refunds" },
];

/**
 * Dashboard-level tab bar. Rendered by the /organizer layout so it stays
 * visible on every organizer page (create, analytics, communities, payments,
 * refunds). Hidden on manage/scan/box-office which have their own chrome.
 */
export function OrganizerNav() {
  const pathname = usePathname();

  const onDashboardItem = ITEMS.some((i) =>
    i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
  if (!onDashboardItem) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      {ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-full bg-neon-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow-violet"
                : "rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-violet-neon dark:border-white/10"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
