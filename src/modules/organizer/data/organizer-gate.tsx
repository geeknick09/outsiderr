import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/shared/server";
import { getSettingInt } from "@/modules/shared/server";
import { createClient } from "@/modules/shared/server";
import { getOrganizerAccessState } from "@/modules/shared";
import { getOrganizerProfile } from "@/modules/shared/server";
import { BecomeOrganizerForm } from "../components/become-organizer-form";
import { OrganizerKycReviewPanel } from "../components/organizer-kyc-review-panel";
import { OrganizerKycRealtimeRefresher } from "../components/organizer-kyc-realtime";

/**
 * Shared gate for organizer dashboard pages. Returns the approved
 * { user, organizerProfile } context, or { gate } JSX when the user is
 * not yet an approved organizer (signup form / KYC pending / rejected).
 */
export async function getOrganizerGateContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer");

  const organizerProfile = await getOrganizerProfile(user);
  if (!organizerProfile) {
    return {
      gate: (
        <div className="py-10">
          <BecomeOrganizerForm />
        </div>
      ),
    } as const;
  }

  const rejectionLimit = await getSettingInt("organizer_rejection_limit");
  const accessState = getOrganizerAccessState({
    kycStatus: organizerProfile.kycStatus,
    rejectionCount: organizerProfile.rejectionCount,
    rejectionLimit,
  });

  const kycInProgress =
    organizerProfile.kycStatus === "PENDING" ||
    organizerProfile.kycStatus === "CLARIFICATION_NEEDED";
  if (!kycInProgress && organizerProfile.kycStatus !== "REJECTED") {
    return { user, organizerProfile, accessState } as const;
  }

  if (accessState.blocked) {
    return {
      gate: (
        <div className="flex min-h-[55vh] items-center py-10">
          <div className="glass mx-auto max-w-lg rounded-3xl border border-red-300 bg-red-500/5 p-8 text-center">
            <h1 className="text-2xl font-black tracking-tight">Organizer application rejected</h1>
            <p className="mt-3 text-sm text-muted">
              Your organizer application was rejected {organizerProfile.rejectionCount ?? 0} time
              {(organizerProfile.rejectionCount ?? 0) === 1 ? "" : "s"} - the maximum allowed
              ({rejectionLimit}) - so this account can&apos;t apply again.
            </p>
            <p className="mt-2 text-sm text-muted">
              If you think this is a mistake, please contact Outsiderr support and we&apos;ll take
              another look.
            </p>
            <Link
              href="/contact"
              className="mt-5 inline-block rounded-2xl border border-red-300 px-8 py-3 text-sm font-bold text-red-500 transition-colors hover:bg-red-500/10"
            >
              Contact support
            </Link>
          </div>
        </div>
      ),
    } as const;
  }

  // Rejected but under the limit -> fresh KYC wizard.
  if (organizerProfile.kycStatus === "REJECTED") {
    return {
      gate: (
        <div className="py-10">
          <BecomeOrganizerForm />
        </div>
      ),
    } as const;
  }

  // KYC in progress - organizer sees the full admin<->organizer conversation.
  const supabase = await createClient();
  const { data: threadRows } = await supabase
    .from("kyc_messages")
    .select("sender_role, sender_email, message, created_at")
    .eq("organizer_id", organizerProfile.id)
    .order("created_at", { ascending: true });
  const thread = (threadRows ?? []).map((m) => ({
    senderRole: m.sender_role,
    senderEmail: m.sender_email,
    message: m.message,
    createdAt: m.created_at,
  }));

  return {
    gate: (
      <div className="min-h-[55vh] space-y-6 py-6">
        <OrganizerKycRealtimeRefresher userId={user.id} />
        <OrganizerKycReviewPanel organizer={organizerProfile} thread={thread} />
      </div>
    ),
  } as const;
}
