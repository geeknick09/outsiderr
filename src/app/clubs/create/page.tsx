import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Clock, ShieldAlert } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { getOrganizerProfile } from "@/lib/data/organizer";
import { ClubForm } from "@/components/organizer/club-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create a Club or Crew — Outsiderr" };

export default async function CreateClubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/clubs/create");

  const organizer = await getOrganizerProfile(user);

  return (
    <div className="mx-auto max-w-lg space-y-5 py-6">
      <div className="flex items-center gap-3">
        <Link
          href="/clubs"
          className="flex items-center gap-1 text-xs text-muted hover:text-violet-neon"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Clubs
        </Link>
      </div>

      {organizer ? (
        <>
          <div>
            <h1 className="text-2xl font-black">Start a Club or Crew</h1>
            <p className="mt-1 text-sm text-muted">
              Submit your club — the Outsiderr team will review it and make it live within 24–48 hours.
            </p>
          </div>

          <div className="flex items-start gap-2.5 rounded-2xl bg-violet-neon/10 px-4 py-3 text-sm text-violet-neon">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Your club will be <strong>pending admin review</strong> after submission — it won&apos;t appear publicly until approved.
            </span>
          </div>

          <ClubForm />
        </>
      ) : (
        <div className="glass flex flex-col items-center gap-4 rounded-3xl p-10 text-center">
          <ShieldAlert className="h-10 w-10 text-amber-500" />
          <div>
            <h1 className="text-xl font-black">Organizers only</h1>
            <p className="mt-2 text-sm text-muted">
              Only verified organizers can create a club or crew. Set up your organizer profile first.
            </p>
          </div>
          <Link
            href="/organizer"
            className="mt-2 rounded-full bg-neon-gradient px-6 py-2.5 text-sm font-bold text-white"
          >
            Go to Organizer Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
