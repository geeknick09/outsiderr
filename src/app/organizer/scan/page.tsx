import Link from "next/link";
import { redirect } from "next/navigation";
import { lazy, Suspense } from "react";

import { getCurrentUser } from "@/lib/auth";
import { getOrganizerProfile, listOrganizerEvents } from "@/lib/data/organizer";

// Lazy load DoorScanner — html5-qrcode is ~110kB
const DoorScanner = lazy(() =>
  import("@/components/organizer/door-scanner").then((m) => ({ default: m.DoorScanner })),
);

export const dynamic = "force-dynamic";

export const metadata = { title: "Door Scanner — Outsiderr" };

export default async function ScanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Forganizer%2Fscan");

  // Only organizers can access the door scanner
  const organizer = await getOrganizerProfile(user);
  if (!organizer) redirect("/organizer");

  // Fetch the organizer's events for the event selector
  const events = await listOrganizerEvents(user);
  const publishedEvents = events.filter((e) => e.status === "PUBLISHED" || e.status === "POSTPONED");

  return (
    <div className="mx-auto max-w-lg space-y-4 py-6">
      <div>
        <Link href="/organizer" className="text-sm text-muted hover:text-violet-neon">
          ← Organizer
        </Link>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Door Scanner</h1>
        <p className="text-sm text-muted">
          Select an event, then point the camera at a ticket QR to check the attendee in.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="glass flex h-64 items-center justify-center rounded-3xl">
            <p className="text-sm text-muted">Loading scanner…</p>
          </div>
        }
      >
        <DoorScanner events={publishedEvents} />
      </Suspense>
    </div>
  );
}
