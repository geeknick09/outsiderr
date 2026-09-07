import { notFound, redirect } from "next/navigation";
import { ScanLine } from "lucide-react";

import { StaffDoorScanner } from "@/components/scan/staff-door-scanner";
import { getCurrentUser } from "@/lib/auth";
import { getStaffEvents } from "@/lib/data/event-staff";
import { getOrganizerProfile } from "@/lib/data/organizer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Door Scanner — Outsiderr" };

export default async function ScanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fscan");

  // Check if the user is either:
  // 1. An organizer (can scan their own events)
  // 2. Assigned as door staff for any event
  const [organizer, staffEvents] = await Promise.all([
    getOrganizerProfile(user),
    getStaffEvents(user),
  ]);

  // If no events and no organizer profile, they don't have access
  if (!organizer && staffEvents.length === 0) {
    notFound();
  }

  // Get initial check-in count for the first event
  let initialCheckInCount = 0;
  if (staffEvents.length > 0) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { count } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", staffEvents[0].id)
      .eq("status", "USED");
    initialCheckInCount = count ?? 0;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 py-6">
      <div>
        <div className="flex items-center gap-2">
          <ScanLine className="h-6 w-6 text-violet-neon" />
          <h1 className="text-2xl font-black tracking-tight">Door Scanner</h1>
        </div>
        <p className="mt-1 text-sm text-muted">
          Scan QR codes to check in attendees. Select an event to begin.
        </p>
      </div>

      <StaffDoorScanner
        events={staffEvents.map((e) => ({
          id: e.id,
          title: e.title,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          status: e.status,
          organizerName: e.organizerName,
        }))}
        initialCheckInCount={initialCheckInCount}
      />
    </div>
  );
}
