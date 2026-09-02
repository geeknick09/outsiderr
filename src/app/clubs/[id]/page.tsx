import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AtSign, BadgeCheck, MapPin, Users } from "lucide-react";

import { JoinClubForm } from "@/components/clubs/join-club-form";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import { getClub, getMyMembership } from "@/lib/data/clubs";
import { CITY_LABELS } from "@/lib/constants";
import { formatPaise } from "@/lib/format";
import type { ClubType, MembershipType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const club = await getClub((await params).id);
  return {
    title: club ? `${club.name} — Outsiderr` : "Club — Outsiderr",
    description: club?.bio ?? undefined,
  };
}

const TYPE_LABEL: Record<ClubType, string> = { CLUB: "Club", CREW: "Crew" };
const MEMBERSHIP_LABEL: Record<MembershipType, string> = {
  FREE: "Free to join",
  PAID: "Paid membership",
  AUDITION: "Audition required",
};

export default async function ClubDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [club, user] = await Promise.all([getClub(id), getCurrentUser()]);
  if (!club) notFound();

  const myMembership = user ? await getMyMembership(user, club.id) : null;
  const isOwner = user?.id === club.ownerId;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      {/* Cover photo */}
      {club.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={club.coverUrl}
          alt={`${club.name} cover`}
          className="h-40 w-full rounded-3xl object-cover sm:h-56"
        />
      ) : null}

      {/* Header */}
      <div className="flex items-start gap-4">
        {club.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={club.avatarUrl}
            alt={club.name}
            className="h-20 w-20 shrink-0 rounded-3xl border-2 border-white object-cover shadow-glow-violet dark:border-zinc-900"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-neon-gradient text-3xl font-black text-white shadow-glow-violet">
            {club.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-black tracking-tight">{club.name}</h1>
            <Badge tone={club.type === "CREW" ? "violet" : "neutral"}>
              {TYPE_LABEL[club.type]}
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <BadgeCheck className="h-4 w-4 text-violet-neon" />
            Run by {club.ownerName}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
            {club.city ? (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {CITY_LABELS[club.city]}
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {club.memberCount} members
            </span>
            {club.instagramHandle ? (
              <a
                href={`https://instagram.com/${club.instagramHandle.replace("@", "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 hover:text-violet-neon"
              >
                <AtSign className="h-3.5 w-3.5" />
                {club.instagramHandle}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bio */}
      {club.bio ? (
        <section className="glass rounded-3xl p-5">
          <h2 className="mb-2 text-base font-bold">About</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{club.bio}</p>
        </section>
      ) : null}

      {/* Membership info */}
      <div className="flex items-center gap-3">
        <Badge
          tone={
            club.membershipType === "FREE" ? "success" : club.membershipType === "PAID" ? "warning" : "violet"
          }
        >
          {MEMBERSHIP_LABEL[club.membershipType]}
        </Badge>
        {club.membershipType === "PAID" ? (
          <span className="text-sm font-bold">{formatPaise(club.membershipFeePaise)}/month</span>
        ) : null}
      </div>

      {/* Join section or status */}
      <div className="space-y-3">
        {isOwner ? (
          <div className="glass rounded-3xl p-5 text-center">
            <p className="text-sm font-semibold">This is your club.</p>
            <Link
              href="/organizer?tab=clubs"
              className="mt-2 inline-block text-sm text-violet-neon hover:underline"
            >
              Manage members →
            </Link>
          </div>
        ) : myMembership ? (
          <div className="glass rounded-3xl p-5 text-center">
            {myMembership.status === "ACCEPTED" ? (
              <>
                <p className="text-lg font-bold text-lime-neon">You&apos;re a member!</p>
                <p className="mt-1 text-sm text-muted">Welcome to {club.name}.</p>
              </>
            ) : myMembership.status === "PENDING" ? (
              <>
                <p className="text-lg font-bold text-amber-500">Request pending</p>
                <p className="mt-1 text-sm text-muted">
                  {club.membershipType === "AUDITION"
                    ? "The crew is reviewing your Instagram. You'll be notified when they decide."
                    : "Your payment is being verified. You'll be notified when it's confirmed."}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-red-500">Request rejected</p>
                <p className="mt-1 text-sm text-muted">You can try joining again.</p>
              </>
            )}
          </div>
        ) : user ? (
          <JoinClubForm club={club} />
        ) : (
          <div className="glass rounded-3xl p-5 text-center">
            <p className="text-sm text-muted">
              <Link href={`/login?next=${encodeURIComponent(`/clubs/${club.id}`)}`} className="font-semibold text-violet-neon hover:underline">
                Log in
              </Link>{" "}
              to join this club.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
