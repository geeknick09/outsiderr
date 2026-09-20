"use client";

import { useRouter } from "next/navigation";

import { useRealtime } from "@/modules/shared";

const KYC_NOTIFICATION_TYPES = new Set([
  "KYC_APPROVED",
  "KYC_REJECTED",
  "KYC_CLARIFICATION",
]);

export function OrganizerKycRealtimeRefresher({ userId }: { userId: string }) {
  const router = useRouter();

  useRealtime({
    channelName: `organizer-kyc:${userId}`,
    table: "event_notifications",
    event: "INSERT",
    filter: `user_id=eq.${userId}`,
    enabled: !!userId,
    onPayload: ({ new: row }) => {
      const type = String(row.type ?? "");
      if (KYC_NOTIFICATION_TYPES.has(type)) {
        router.refresh();
      }
    },
  });

  return null;
}
