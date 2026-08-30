import Link from "next/link";
import { redirect } from "next/navigation";

import { DoorScanner } from "@/components/organizer/door-scanner";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Door Scanner — Outsiderr" };

export default async function ScanPage() {
  if (!(await getCurrentUser())) redirect("/login?next=%2Forganizer%2Fscan");

  return (
    <div className="mx-auto max-w-lg space-y-4 py-6">
      <div>
        <Link href="/organizer" className="text-sm text-muted hover:text-violet-neon">
          ← Organizer
        </Link>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Door Scanner</h1>
        <p className="text-sm text-muted">
          Point the camera at a ticket QR to check the attendee in.
        </p>
      </div>
      <DoorScanner />
    </div>
  );
}
