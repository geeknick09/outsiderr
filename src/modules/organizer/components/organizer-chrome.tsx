"use client";

import { usePathname } from "next/navigation";

import type { Organizer } from "@/modules/shared";
import { OrganizerHeader } from "./organizer-header";
import { OrganizerNav } from "./organizer-nav";

/**
 * Dashboard chrome: organizer header (avatar, bio, socials) followed by the
 * tab bar - constant across every organizer dashboard page. Hidden on manage /
 * scan / box-office / report routes which have their own chrome.
 */
export function OrganizerChrome({
  organizer,
  followerCount,
}: {
  organizer: Organizer | null;
  followerCount: number;
}) {
  const pathname = usePathname();

  const showChrome =
    pathname === "/organizer" ||
    pathname === "/organizer/create" ||
    pathname === "/organizer/analytics" ||
    pathname === "/organizer/clubs" ||
    pathname === "/organizer/payments" ||
    pathname === "/organizer/refunds";

  if (!showChrome) return null;
  if (!organizer) return <OrganizerNav />;

  return (
    <div className="space-y-2 pt-4">
      <OrganizerHeader organizer={organizer} followerCount={followerCount} />
      <OrganizerNav />
    </div>
  );
}
