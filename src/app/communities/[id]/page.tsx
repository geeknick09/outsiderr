import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AtSign, BadgeCheck, CalendarDays, Lock, MapPin, Users } from "lucide-react";

import { JoinCommunityForm, CommunityFollowButton } from "@/modules/web";
import { Badge } from "@/modules/shared";
import { getCurrentUser } from "@/modules/shared/server";
import {
  getCommunity,
  getMyMembership,
  listJoinQuestions,
  listCommunityEvents,
  isFollowingCommunity,
  getCommunityFollowerCount,
} from "@/modules/shared/server";
import { logPageViewAction } from "@/modules/shared/actions/communities";
import { cityLabel } from "@/modules/shared";
import type { CommunityType, JoinMode } from "@/modules/shared";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const community = await getCommunity((await params).id);
  return {
    title: community ? `${community.name} - Outsiderr` : "Community - Outsiderr",
    description: community?.bio ?? undefined,
  };
}

const TYPE_LABEL: Record<CommunityType, string> = { CLUB: "Community", CREW: "Crew" };
const MEMBERSHIP_LABEL: Record<JoinMode, string> = {
  OPEN: "Open community",
  PRIVATE: "Request to join",
  INVITE_ONLY: "Invite only",
};

export default async function CommunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string; ref?: string }>;
}) {
  const { id } = await params;
  const { invite, ref } = await searchParams;
  const [community, user] = await Promise.all([getCommunity(id), getCurrentUser()]);
  if (!community) notFound();

  const [myMembership, questions, events, isFollowing, followerCount] = await Promise.all([
    user ? getMyMembership(user, community.id) : null,
    community.membershipType === "PRIVATE" ? listJoinQuestions(community.id) : [],
    listCommunityEvents(community.id),
    user ? isFollowingCommunity(user, community.id) : false,
    getCommunityFollowerCount(community.id),
  ]);
  const isOwner = user?.id === community.ownerId;
  if (!community.verified && !isOwner) notFound();

  // Log the view (fire-and-forget; logged-in users only)
  if (user && !isOwner) void logPageViewAction("COMMUNITY", community.id);

  const validInvite =
    community.membershipType === "INVITE_ONLY" &&
    !!invite &&
    community.inviteToken === invite;

  const upcoming = events.filter((e) => new Date(e.startsAt).getTime() >= Date.now());
  const past = events.filter((e) => new Date(e.startsAt).getTime() < Date.now());

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      {/* Cover photo */}
      {community.coverUrl ? (
        <div className="relative h-40 w-full overflow-hidden rounded-3xl sm:h-56">
          <Image
            src={community.coverUrl}
            alt={`${community.name} cover`}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      ) : null}

      {/* Header */}
      <div className="flex items-start gap-4">
        {community.avatarUrl ? (
          <Image
            src={community.avatarUrl}
            alt={community.name}
            width={80}
            height={80}
            className="h-20 w-20 shrink-0 rounded-3xl border-2 border-white object-cover shadow-glow-violet dark:border-zinc-900"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-neon-gradient text-3xl font-black text-white shadow-glow-violet">
            {community.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-black tracking-tight">{community.name}</h1>
            <Badge tone={community.type === "CREW" ? "violet" : "neutral"}>
              {TYPE_LABEL[community.type]}
            </Badge>
            <Badge tone={community.membershipType === "OPEN" ? "success" : community.membershipType === "PRIVATE" ? "warning" : "neutral"}>
              {MEMBERSHIP_LABEL[community.membershipType]}
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <BadgeCheck className="h-4 w-4 text-violet-neon" />
            Run by {community.ownerName}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
            {community.city ? (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {cityLabel(community.city)}
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {community.memberCount} members
            </span>
            {community.instagramHandle ? (
              <a
                href={`https://instagram.com/${community.instagramHandle.replace("@", "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 hover:text-violet-neon"
              >
                <AtSign className="h-3.5 w-3.5" />
                {community.instagramHandle}
              </a>
            ) : null}
          </div>
        </div>
        {user && !isOwner ? (
          <CommunityFollowButton communityId={community.id} isFollowing={isFollowing} />
        ) : null}
      </div>

      {/* Bio */}
      {community.bio ? (
        <section className="glass rounded-3xl p-5">
          <h2 className="mb-2 text-base font-bold">About</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{community.bio}</p>
        </section>
      ) : null}

      {/* Gallery (up to 12) */}
      {community.galleryUrls.length ? (
        <section className="space-y-2">
          <h2 className="text-base font-bold">Gallery</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {community.galleryUrls.slice(0, 12).map((url, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-2xl">
                <Image src={url} alt="" fill sizes="180px" className="object-cover" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Event calendar */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <CalendarDays className="h-4 w-4 text-violet-neon" />
          Events
        </h2>
        {events.length === 0 ? (
          <p className="glass rounded-2xl p-4 text-sm text-muted">No events yet — follow to hear first.</p>
        ) : (
          <div className="space-y-2">
            {[...upcoming, ...past].map((e) => {
              const d = new Date(e.startsAt);
              return (
                <Link
                  key={e.id}
                  href={`/events/${e.id}`}
                  className="glass flex items-center gap-3 rounded-2xl p-3 transition-all hover:border-violet-neon"
                >
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-violet-neon/10 text-violet-neon">
                    <span className="text-[10px] font-bold uppercase">{d.toLocaleString("en-IN", { month: "short" })}</span>
                    <span className="text-lg font-black leading-none">{d.getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{e.title}</p>
                    <p className="truncate text-xs text-muted">
                      {d.toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })}
                      {" · "}{e.venueName}{" · "}{cityLabel(e.city)}
                    </p>
                  </div>
                  {e.visibility === "MEMBERS_ONLY" ? (
                    <Badge tone="violet">Members</Badge>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Terms */}
      {community.terms.length ? (
        <section className="glass rounded-3xl p-5">
          <h2 className="mb-2 text-base font-bold">Terms &amp; rules</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {community.terms.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </section>
      ) : null}

      {/* Join section */}
      <div className="space-y-3">
        {isOwner ? (
          <div className="glass rounded-3xl p-5 text-center">
            <p className="text-sm font-semibold">This is your community.</p>
            <Link
              href={`/organizer/communities/${community.id}`}
              className="mt-2 inline-block text-sm text-violet-neon hover:underline"
            >
              Manage community →
            </Link>
          </div>
        ) : myMembership ? (
          <div className="glass rounded-3xl p-5 text-center">
            {myMembership.status === "ACCEPTED" ? (
              <>
                <p className="text-lg font-bold text-lime-neon">You&apos;re a member!</p>
                <p className="mt-1 text-sm text-muted">
                  Welcome to {community.name}. You&apos;ll be notified about every community event.
                </p>
                {myMembership.inviteCode ? (
                  <p className="mt-2 text-xs text-muted">
                    Invite friends:{" "}
                    <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-white/10">
                      /communities/{community.id}?ref={myMembership.inviteCode}
                    </code>
                  </p>
                ) : null}
              </>
            ) : myMembership.status === "PENDING" ? (
              <>
                <p className="text-lg font-bold text-amber-500">Request pending</p>
                <p className="mt-1 text-sm text-muted">
                  The organizer is reviewing your request — you&apos;ll be notified when they decide.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-red-500">Request rejected</p>
                <p className="mt-1 text-sm text-muted">You can try joining again.</p>
              </>
            )}
          </div>
        ) : community.membershipType === "INVITE_ONLY" && !validInvite ? (
          <div className="glass rounded-3xl p-5 text-center">
            <Lock className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-2 font-bold">Invite only</p>
            <p className="mt-1 text-sm text-muted">
              This community only admits members through an invite link.
            </p>
          </div>
        ) : user ? (
          <JoinCommunityForm
            community={community}
            questions={questions}
            inviteToken={validInvite ? invite! : null}
            refCode={ref ?? null}
          />
        ) : (
          <div className="glass rounded-3xl p-5 text-center">
            <p className="text-sm text-muted">
              <Link href={`/login?next=${encodeURIComponent(`/communities/${community.id}`)}`} className="font-semibold text-violet-neon hover:underline">
                Log in
              </Link>{" "}
              to join this community.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
