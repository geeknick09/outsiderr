"use client";

import { useRouter } from "next/navigation";

import { useRealtime } from "@/modules/shared";

/**
 * Live-refresh the admin KYC queue when:
 *  - an organizer submits/resubmits or updates KYC fields (organizers UPDATE)
 *  - an organizer replies to the review thread (kyc_messages INSERT)
 * Both tables are in the supabase_realtime publication.
 */
export function AdminKycRealtimeRefresher() {
  const router = useRouter();

  useRealtime({
    channelName: "admin-kyc:organizers",
    table: "organizers",
    event: "*",
    onPayload: () => router.refresh(),
  });

  useRealtime({
    channelName: "admin-kyc:messages",
    table: "kyc_messages",
    event: "INSERT",
    onPayload: () => router.refresh(),
  });

  return null;
}
