"use client";

import { useState } from "react";

import { StaffLogin, type StaffDoorSession } from "./staff-login";
import { StaffDoorScannerLazy } from "./staff-door-scanner-lazy";
import { GuestlistSection } from "./guestlist-section";

export function ScanPageClient() {
  const [session, setSession] = useState<StaffDoorSession | null>(null);

  if (!session) {
    return <StaffLogin onVerified={setSession} />;
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <StaffDoorScannerLazy
        events={session.events}
        initialCheckInCount={0}
        staffName={session.staffName}
        staffToken={session.staffToken}
      />
      <GuestlistSection staffToken={session.staffToken} events={session.events} />
    </div>
  );
}
