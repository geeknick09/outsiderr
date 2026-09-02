import Link from "next/link";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { AtSign, Clock, MapPin, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import { listClubs } from "@/lib/data/clubs";
import { getOrganizerProfile } from "@/lib/data/organizer";
import { CITIES, CITY_LABELS } from "@/lib/constants";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { City, ClubType, MembershipType } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Clubs & Crews — Outsiderr" };

const TYPE_LABEL: Record<ClubType, string> = {
  CLUB: "Club",
  CREW: "Crew",
};

const MEMBERSHIP_LABEL: Record<MembershipType, string> = {
  FREE: "Free to join",
  PAID: "Paid membership",
  AUDITION: "Audition required",
};

const MEMBERSHIP_TONE: Record<MembershipType, "success" | "warning" | "violet"> = {
  FREE: "success",
  PAID: "warning",
  AUDITION: "violet",
};

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; submitted?: string }>;
}) {
  const { city, submitted } = await searchParams;
  const cityFilter = city && city !== "ALL" ? (city as City) : undefined;
  const [clubs, user] = await Promise.all([listClubs(cityFilter), getCurrentUser()]);
  const organizer = user ? await getOrganizerProfile(user) : null;
  const isOrganizer = !!organizer;

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Clubs & Crews</h1>
          <p className="text-sm text-muted">
            Join a community. Run together, skate together, rap together.
          </p>
        </div>
        {isOrganizer ? (
          <Link
            href="/clubs/create"
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
            Your club has been submitted! It will appear here once the Outsiderr team approves it (usually within 24–48 hours).
          </span>
        </div>
      ) : null}

      {/* City filter */}
      <div className="flex flex-wrap gap-2">
        <CityChip href="/clubs" active={!cityFilter} label="All cities" />
        {CITIES.map((c) => (
          <CityChip
            key={c.value}
            href={`/clubs?city=${c.value}`}
            active={cityFilter === c.value}
            label={c.label}
          />
        ))}
      </div>

      {/* Clubs grid */}
      {clubs.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center">
          <p className="text-sm text-muted">No clubs or crews here yet.</p>
          {isOrganizer ? (
            <Link
              href="/clubs/create"
              className="mt-3 inline-block text-sm font-semibold text-violet-neon underline-offset-2 hover:underline"
            >
              Be the first — start a club
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((club) => (
            <Link
              key={club.id}
              href={`/clubs/${club.id}`}
              className="glass group rounded-3xl p-5 transition-all hover:-translate-y-1 hover:border-violet-neon/50 hover:shadow-[0_0_28px_rgba(139,92,246,0.35)]"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neon-gradient text-lg font-black text-white">
                  {club.name.slice(0, 1)}
                </div>
                <Badge tone={club.type === "CREW" ? "violet" : "neutral"}>
                  {TYPE_LABEL[club.type]}
                </Badge>
              </div>

              <h3 className="text-base font-bold">{club.name}</h3>
              {club.bio ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted">{club.bio}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                {club.city ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {CITY_LABELS[club.city]}
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {club.memberCount}
                </span>
                {club.instagramHandle ? (
                  <span className="flex items-center gap-1">
                    <AtSign className="h-3 w-3" />
                    {club.instagramHandle}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <Badge tone={MEMBERSHIP_TONE[club.membershipType]}>
                  {MEMBERSHIP_LABEL[club.membershipType]}
                </Badge>
                {club.membershipType === "PAID" ? (
                  <span className="text-sm font-bold">{formatPaise(club.membershipFeePaise)}/mo</span>
                ) : null}
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
