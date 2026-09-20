"use client";

import { useState } from "react";

import { PinLogin, type VerifiedScannerSession } from "./pin-login";
import { StaffDoorScannerLazy } from "./staff-door-scanner-lazy";

export interface ScannerEventOption {
  id: string;
  title: string;
  organizerName: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
}

export function ScanPageClient({ events }: { events: ScannerEventOption[] }) {
  const [session, setSession] = useState<VerifiedScannerSession | null>(null);

  if (!session) {
    return <PinLogin events={events} onVerified={setSession} />;
  }

  return (
    <StaffDoorScannerLazy
      events={[
        {
          id: session.eventId,
          title: session.eventTitle,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          status: session.status,
          organizerName: session.organizerName,
        },
      ]}
      initialCheckInCount={session.checkedInCount}
      staffName={session.staffName}
      pin={session.pin}
    />
  );
}
