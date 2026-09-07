"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useRealtime } from "@/lib/hooks/use-realtime";

/**
 * Wraps the event detail page to provide realtime updates when the organizer
 * changes the event's date/time/venue, postpones, or cancels it.
 *
 * When a change is detected, we:
 * 1. Show a notification banner ("Event details updated — refreshing…")
 * 2. Call router.refresh() to re-fetch server component data
 * 3. Auto-dismiss the banner after 3 seconds
 */
export function EventRealtimeWrapper({
  eventId,
  children,
}: {
  eventId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [bannerText, setBannerText] = useState("Event details updated");

  useRealtime({
    channelName: `event-detail:${eventId}`,
    table: "events",
    event: "UPDATE",
    filter: `id=eq.${eventId}`,
    onPayload: ({ new: row }) => {
      const status = row.status as string;
      if (status === "POSTPONED") {
        setBannerText("Event has been postponed — new dates loaded");
      } else if (status === "CANCELLED" || status === "CANCELLATION_REQUESTED") {
        setBannerText("Event has been cancelled — details updated");
      } else {
        setBannerText("Event details updated — refreshing");
      }
      setShowBanner(true);

      // Debounce refresh — if multiple fields change in one update, we only refresh once
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        router.refresh();
      }, 300);
    },
  });

  // Auto-dismiss banner
  useEffect(() => {
    if (!showBanner) return;
    const t = setTimeout(() => setShowBanner(false), 4000);
    return () => clearTimeout(t);
  }, [showBanner]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  return (
    <>
      {showBanner ? (
        <div className="fixed left-1/2 top-4 z-[3000] -translate-x-1/2 rounded-2xl bg-violet-neon px-5 py-3 text-sm font-bold text-white shadow-glow-violet animate-in fade-in slide-in-from-top-4">
          {bannerText}
        </div>
      ) : null}
      {children}
    </>
  );
}
