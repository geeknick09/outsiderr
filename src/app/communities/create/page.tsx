import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Sparkles } from "lucide-react";

import { getCurrentUser, listDistinctSubcategories, getOrganizerProfile } from "@/modules/shared/server";
import { CommunityForm } from "@/modules/shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create a Community or Crew - Outsiderr" };

export default async function CreateClubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/communities/create");

  const [organizer, existingSubcategories] = await Promise.all([
    getOrganizerProfile(user),
    listDistinctSubcategories(),
  ]);

  return (
    <div className="mx-auto max-w-lg space-y-5 py-6">
      <div className="flex items-center gap-3">
        <Link
          href="/communities"
          className="flex items-center gap-1 text-xs text-muted hover:text-violet-neon"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Communities
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-black">Start a Community or Crew</h1>
        <p className="mt-1 text-sm text-muted">
          Create your crew and it goes live instantly - share it with your people.
        </p>
      </div>

      {organizer ? (
        <CommunityForm existingSubcategories={existingSubcategories} />
      ) : (
        <div className="glass flex flex-col items-center gap-4 rounded-3xl p-10 text-center">
          <Sparkles className="h-10 w-10 text-violet-neon" />
          <div>
            <h2 className="text-xl font-black">Set up your creator profile first</h2>
            <p className="mt-2 text-sm text-muted">
              Communities live inside the Creator Hub - a quick setup (name + PAN) takes a minute. Bank details are optional until you start taking payouts.
            </p>
          </div>
          <Link
            href="/organizer?next=/communities/create"
            className="mt-2 rounded-full bg-neon-gradient px-6 py-2.5 text-sm font-bold text-white"
          >
            Become a Creator
          </Link>
        </div>
      )}
    </div>
  );
}
