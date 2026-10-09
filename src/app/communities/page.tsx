import Link from "next/link";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { AtSign, Clock, MapPin, Users } from "lucide-react";

import { Badge } from "@/modules/shared";
import { getCurrentUser } from "@/modules/shared/server";
import { listCommunities } from "@/modules/shared/server";
import { getOrganizerProfile } from "@/modules/shared/server";
import { CITIES, cityLabel } from "@/modules/shared";
import { cn } from "@/modules/shared";
import type { City, CommunityType, JoinMode } from "@/modules/shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Communities & Crews - Outsiderr" };

const TYPE_LABEL: Record<CommunityType, string> = {
  CLUB: "Community",
  CREW: "Crew",
};

const MEMBERSHIP_LABEL: Record<JoinMode, string> = {
  OPEN: "Open",
  PRIVATE: "Request to join",
  INVITE_ONLY: "Invite only",
};

const MEMBERSHIP_TONE: Record<JoinMode, "success" | "warning" | "neutral"> = {
  OPEN: "success",
  PRIVATE: "warning",
  INVITE_ONLY: "neutral",
};

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; submitted?: string }>;
}) {
  const { city, submitted } = await searchParams;
  const cityFilter = city && city !== "ALL" ? (city as City) : undefined;
  const [communities, user] = await Promise.all([listCommunities(cityFilter), getCurrentUser()]);
  const organizer = user ? await getOrganizerProfile(user) : null;
  const isOrganizer = !!organizer;

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Communities & Crews</h1>
          <p className="text-sm text-muted">
            Join a community. Run together, skate together, rap together.
          </p>
        </div>
        {isOrganizer ? (
          <Link
            href="/communities/create"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-neon-gradient px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create
          </Link>
        ) : null}
      </div>

      {/* Submission success banner */}
      {submitted === "1" ? (
        <div className="flex items-center gap-2.5 rounded-2xl bg-lime-400/15 px-4 py-3 text-sm text-lime-600 dark:text-lime-400">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            Your community has been submitted! It will appear here once the Outsiderr team approves it (usually within 24-48 hours).
          </span>
        </div>
      ) : null}

      {/* City filter */}
      <div className="flex flex-wrap gap-2">
        <CityChip href="/communities" active={!cityFilter} label="All cities" />
        {CITIES.map((c) => (
          <CityChip
            key={c.value}
            href={`/communities?city=${c.value}`}
            active={cityFilter === c.value}
            label={c.label}
          />
        ))}
      </div>

      {/* Communities grid */}
      {communities.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center">
          <p className="text-sm text-muted">No communities or crews here yet.</p>
          {isOrganizer ? (
            <Link
              href="/communities/create"
              className="mt-3 inline-block text-sm font-semibold text-violet-neon underline-offset-2 hover:underline"
            >
              Be the first - start a community
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {communities.map((community) => (
            <Link
              key={community.id}
              href={`/communities/${community.id}`}
              className="glass group rounded-3xl p-5 transition-all hover:-translate-y-1 hover:border-violet-neon/50 hover:shadow-[0_0_28px_rgba(139,92,246,0.35)]"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neon-gradient text-lg font-black text-white">
                  {community.name.slice(0, 1)}
                </div>
                <Badge tone={community.type === "CREW" ? "violet" : "neutral"}>
                  {TYPE_LABEL[community.type]}
                </Badge>
              </div>

              <h3 className="text-base font-bold">{community.name}</h3>
              {community.bio ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted">{community.bio}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                {community.city ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {cityLabel(community.city)}
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {community.memberCount}
                </span>
                {community.instagramHandle ? (
                  <span className="flex items-center gap-1">
                    <AtSign className="h-3 w-3" />
                    {community.instagramHandle}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <Badge tone={MEMBERSHIP_TONE[community.membershipType]}>
                  {MEMBERSHIP_LABEL[community.membershipType]}
                </Badge>

              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CityChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-violet-neon bg-violet-neon/10 text-violet-neon"
          : "border-zinc-200 text-muted hover:border-violet-neon/50 dark:border-white/10",
      )}
    >
      {label}
    </Link>
  );
}
