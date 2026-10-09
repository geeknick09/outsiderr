"use client";

import { useState } from "react";

import { StaffLogin, type StaffDoorSession } from "./staff-login";
import { StaffDoorScannerLazy } from "./staff-door-scanner-lazy";

export function ScanPageClient() {
  const [session, setSession] = useState<StaffDoorSession | null>(null);

  if (!session) {
    return <StaffLogin onVerified={setSession} />;
  }

  return (
    <StaffDoorScannerLazy
      events={session.events}
      initialCheckInCount={0}
      staffName={session.staffName}
      staffToken={session.staffToken}
    />
  );
}
