import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { getCurrentUser, listDistinctSubcategories } from "@/modules/shared/server";
import { CommunityForm } from "@/modules/shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create a Community or Crew - Outsiderr" };

export default async function CreateClubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/communities/create");

  const existingSubcategories = await listDistinctSubcategories();

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

      <CommunityForm existingSubcategories={existingSubcategories} />
    </div>
  );
}
