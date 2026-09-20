"use client";

import dynamicImport from "next/dynamic";

// Lazy-load the scanner — it pulls in html5-qrcode (heavy camera library ~110kB)
// ssr: false is allowed here because this is a Client Component
const StaffDoorScanner = dynamicImport(
  () => import("./staff-door-scanner").then((m) => m.StaffDoorScanner),
  {
    loading: () => (
      <div className="glass aspect-square w-full animate-pulse rounded-3xl bg-zinc-200 dark:bg-white/10" />
    ),
    ssr: false,
  },
);

export function StaffDoorScannerLazy(props: {
  events: { id: string; title: string; startsAt: string; endsAt: string | null; status: string; organizerName: string }[];
  initialCheckInCount: number;
  staffName?: string;
  pin?: string;
}) {
  return <StaffDoorScanner {...props} />;
}
