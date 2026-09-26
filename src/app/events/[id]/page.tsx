import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { BadgeCheck, CalendarDays, Globe, Info, Link2, Mail, MapPin, MessageCircle, Phone, Play, Star, UserPlus } from "lucide-react";
import { InstagramIcon } from "@/modules/shared";
import { EventRealtimeWrapper } from "@/modules/web";

import { EventReviews } from "@/modules/web";
import { MapEmbed } from "@/modules/web";
import { PhotoGallery } from "@/modules/web";
import { PreviousEditions } from "@/modules/web";
import { ShareEventButton } from "@/modules/web";
import { TagPills } from "@/modules/web";
import { TermsAccordion } from "@/modules/web";
import { TicketTiers } from "@/modules/web";
import { UpdateMeButton } from "@/modules/web";
import { FollowOrganizerButton } from "@/modules/web";
import { Badge } from "@/modules/shared";
import { CATEGORY_LABELS, CITY_LABELS } from "@/modules/shared";
import { getCurrentUser } from "@/modules/shared/server";
import { getEvent, getLinkedPastEvents } from "@/modules/shared/server";
import { getEventReviews } from "@/modules/shared/server";
import { isSubscribedToEvent, getEventCollaborators } from "@/modules/shared/server";
import { getOrganizerFollowerCount, isFollowingOrganizer } from "@/modules/shared/server";
import { getOrganizerRating } from "@/modules/shared/server";
import { getWaitlistEntry, getWaitlistCount } from "@/modules/shared/server";
import { formatDateRange, mapsLink } from "@/modules/shared";

export const dynamic = "force-dynamic";
// Event detail pages are dynamic (user-specific waitlist, ticket availability),
// but we tag the page so mutations can invalidate it via revalidateTag.
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const event = await getEvent((await params).id);
  return {
    title: event ? `${event.title} — Outsiderr` : "Event — Outsiderr",
    description: event?.description.slice(0, 160),
  };
}

export default async function EventDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [event, user] = await Promise.all([getEvent(id), getCurrentUser()]);
  if (!event) notFound();

  // Draft events are only visible to the organizer and admins
  if (event.status === "DRAFT") {
    const isOrganizer = user && event.organizer.ownerId === user.id;
    let isAdmin = false;
    if (user && !isOrganizer) {
      const { createClient } = await import("@/modules/shared/server");
      const supabase = await createClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = profile?.is_admin === true;
    }
    if (!isOrganizer && !isAdmin) notFound();
  }

  const banner = event.bannerPosterUrl ?? event.cardPosterUrl;
  const cardPoster = event.cardPosterUrl ?? event.bannerPosterUrl;

  // Waitlist data for sold-out tiers (passed to TicketTiers so it can show
  // "On waitlist" state and waitlist counts)
  // Account for reserved tickets too — a tier with only reserved tickets left is effectively sold out
  // Only fetch waitlist data if the organizer has enabled waitlist for this event
  const soldOutTiers = event.tiers.filter(
    (t) => t.quantity - t.quantitySold - (t.quantityReserved ?? 0) <= 0,
  );
  // Parallelize entry + count fetches per tier (was sequential before)
  const waitlistData = event.waitlistEnabled
    ? await Promise.all(
        soldOutTiers.map(async (tier) => {
          const [entry, count] = await Promise.all([
            user ? getWaitlistEntry(user, tier.id) : Promise.resolve(null),
            getWaitlistCount(tier.id),
          ]);
          return { tierId: tier.id, entry, count };
        }),
      )
    : [];

  // Fetch linked past events + reviews (only for completed events)
  const nowMs = Date.now();
  const startMs = new Date(event.startsAt).getTime();
  const endMs = event.endsAt ? new Date(event.endsAt).getTime() : startMs;
  const eventEnded = endMs <= nowMs;

  const [linkedPastEvents, eventReviews, isSubscribed, collaborators, followerCount, isFollowing, organizerRating] = await Promise.all([
    event.linkedPastEventIds.length > 0
      ? getLinkedPastEvents(event.linkedPastEventIds)
      : Promise.resolve([]),
    eventEnded ? getEventReviews(event.id) : Promise.resolve([]),
    user ? isSubscribedToEvent(user, event.id) : Promise.resolve(false),
    getEventCollaborators(event.id),
    getOrganizerFollowerCount(event.organizer.id),
    user ? isFollowingOrganizer(user, event.organizer.id) : Promise.resolve(false),
    getOrganizerRating(event.organizer.id),
  ]);
  const isOwnEvent = !!user && event.organizer.ownerId === user.id;

  // Per-co-organizer stats: follower count, rating, viewer's follow state
  const collabDetails = await Promise.all(
    collaborators.map(async (collab) => ({
      collab,
      followerCount: await getOrganizerFollowerCount(collab.organizerId),
      rating: await getOrganizerRating(collab.organizerId),
      isFollowing: user ? await isFollowingOrganizer(user, collab.organizerId) : false,
    })),
  );

  // Build share URL dynamically from request origin, falling back to env
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `${proto}://${host}`;
  const eventUrl = `${baseUrl}/events/${event.id}`;

  return (
    <EventRealtimeWrapper eventId={event.id}>
    <div className="-mt-6 overflow-x-hidden">
      {/* Hero: 3:4 card poster on mobile, 16:9 banner on desktop */}
      <div className="relative -mx-4 overflow-hidden sm:rounded-b-3xl">
        <div className="relative hidden aspect-video max-h-[440px] w-full sm:block">
          {banner ? (
            <Image
              src={banner}
              alt={event.title}
              fill
              sizes="100vw"
              priority
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-neon-gradient" />
          )}
          {/* Blend the poster into the page background. */}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-50 via-zinc-50/30 to-transparent dark:from-ink dark:via-ink/40" />
        </div>
        <div className="relative aspect-[3/4] max-h-[70vh] w-full sm:hidden">
          {cardPoster ? (
            <Image
              src={cardPoster}
              alt={event.title}
              fill
              sizes="100vw"
              priority
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-neon-gradient" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-50 via-zinc-50/30 to-transparent dark:from-ink dark:via-ink/40" />
        </div>
      </div>

      <div className="grid gap-6 pt-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {event.categories.map((cat) => (
                <Badge key={cat} tone="violet">{CATEGORY_LABELS[cat]}</Badge>
              ))}
              <Badge tone="neutral">{CITY_LABELS[event.city]}</Badge>
              {event.isFeatured ? <Badge tone="lime">Sponsored</Badge> : null}
            </div>

            <TagPills tags={event.tags} />

            <div className="flex items-start justify-between gap-3">
              <h1 className="break-words text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                {event.title}
              </h1>
              <ShareEventButton title={event.title} url={eventUrl} />
            </div>

            <p className="text-sm text-muted">
              Hosted by{" "}
              <Link
                href={`/organizers/${event.organizer.id}`}
                className="font-semibold text-zinc-900 hover:text-violet-neon dark:text-white"
              >
                {event.organizer.name}
              </Link>
            </p>

            <div className="flex flex-col gap-2 pt-2 text-sm">
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-violet-neon" />
                {formatDateRange(event.startsAt, event.endsAt)}
              </span>
              {event.venueName === "TBA" || (!event.venueName && !event.venueAddress) ? (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pink-neon" />
                  <span>
                    Venue TBA
                    <span className="block text-xs text-muted">Location will be announced later</span>
                  </span>
                </div>
              ) : (
                <a
                  href={
                    event.googleMapsLink
                      ? event.googleMapsLink
                      : event.latitude && event.longitude
                        ? mapsLink(
                            event.latitude,
                            event.longitude,
                            `${event.venueName}, ${event.venueAddress}`,
                          )
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            `${event.venueName}, ${event.venueAddress}`,
                          )}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-2 hover:text-violet-neon"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pink-neon" />
                  <span>
                    {event.venueName}
                    {event.venueAddress ? (
                      <span className="block text-xs text-muted">{event.venueAddress}</span>
                    ) : null}
                  </span>
                </a>
              )}
            </div>

            {event.venueName !== "TBA" && event.latitude && event.longitude ? (
              <MapEmbed
                latitude={event.latitude}
                longitude={event.longitude}
                venueName={event.venueName}
                googleMapsLink={event.googleMapsLink}
              />
            ) : null}
          </div>

          <section className="glass rounded-3xl p-5">
            <h2 className="mb-2 text-base font-bold">About Event</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
              {event.description}
            </p>
          </section>

          <PhotoGallery photos={event.photoUrls} title={event.title} />

          {event.thingsToKnow.length > 0 ? (
            <section className="glass rounded-3xl p-5">
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
                <Info className="h-4 w-4 text-lime-neon" />
                Things to Know
              </h2>
              <ul className="space-y-2 text-sm text-muted">
                {event.thingsToKnow.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pink-neon" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="glass rounded-3xl p-5">
            <h2 className="mb-3 text-base font-bold">Organized By</h2>
            <Link
              href={`/organizers/${event.organizer.id}`}
              className="flex items-center gap-4 hover:opacity-80"
            >
              {event.organizer.avatarUrl ? (
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl">
                  <Image
                    src={event.organizer.avatarUrl}
                    alt={event.organizer.name}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neon-gradient text-lg font-black text-white">
                  {event.organizer.name.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <span className="truncate">{event.organizer.name}</span>
                  {event.organizer.verified ? (
                    <BadgeCheck className="h-4 w-4 shrink-0 text-violet-neon" />
                  ) : null}
                </p>
                {organizerRating.totalReviews > 0 ? (
                  <p className="mt-0.5 flex items-center gap-1 text-xs">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-bold">{organizerRating.averageRating.toFixed(1)}</span>
                    <span className="text-muted">({organizerRating.totalReviews} review{organizerRating.totalReviews === 1 ? "" : "s"})</span>
                  </p>
                ) : null}
                <p className="mt-0.5 text-xs text-muted">
                  {followerCount} follower{followerCount === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
            <div className="mt-3">
              {user && !isOwnEvent ? (
                <FollowOrganizerButton organizerId={event.organizer.id} isFollowing={isFollowing} />
              ) : !user ? (
                <Link
                  href={`/login?next=/events/${event.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-violet-neon/40 px-5 py-2 text-sm font-bold text-violet-neon transition-all hover:bg-violet-neon/10"
                >
                  <UserPlus className="h-4 w-4" /> Follow
                </Link>
              ) : null}
            </div>
          </section>

          {/* Co-organizers / Collaborators */}
          {collabDetails.length > 0 ? (
            <section className="glass rounded-3xl p-5">
              <h2 className="mb-3 text-base font-bold">Co-Organizers</h2>
              <div className="space-y-4">
                {collabDetails.map(({ collab, followerCount: cFollowers, rating, isFollowing: cIsFollowing }) => (
                  <div key={collab.id} className="flex items-center gap-3">
                    <Link
                      href={`/organizers/${collab.organizerId}`}
                      className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80"
                    >
                      {collab.organizerPhotoUrl ? (
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl">
                          <Image
                            src={collab.organizerPhotoUrl}
                            alt={collab.organizerName}
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neon-gradient text-sm font-bold text-white">
                          {collab.organizerName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{collab.organizerName}</span>
                        {rating.totalReviews > 0 ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            <span className="font-bold">{rating.averageRating.toFixed(1)}</span>
                            <span className="text-muted">({rating.totalReviews} review{rating.totalReviews === 1 ? "" : "s"})</span>
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-muted">
                          {cFollowers} follower{cFollowers === 1 ? "" : "s"}
                        </p>
                      </div>
                    </Link>
                    {user && collab.organizerOwnerId !== user.id ? (
                      <FollowOrganizerButton organizerId={collab.organizerId} isFollowing={cIsFollowing} compact />
                    ) : !user ? (
                      <Link
                        href={`/login?next=/events/${event.id}`}
                        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-violet-neon/40 px-3 py-1.5 text-xs font-bold text-violet-neon transition-all hover:bg-violet-neon/10"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Follow
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Contact details */}
          {event.contactEmail || event.contactPhone || event.instagramUrl || event.youtubeUrl || event.xUrl || event.facebookUrl || event.linkedinUrl ? (
            <section className="glass rounded-3xl p-5">
              <h2 className="mb-3 text-base font-bold">Contact Organizer</h2>
              <div className="space-y-2 text-sm">
                {event.contactEmail ? (
                  <a
                    href={`mailto:${event.contactEmail}`}
                    className="flex items-center gap-2 text-muted hover:text-violet-neon"
                  >
                    <Mail className="h-4 w-4" />
                    {event.contactEmail}
                  </a>
                ) : null}
                {event.contactPhone ? (
                  <a
                    href={`tel:${event.contactPhone}`}
                    className="flex items-center gap-2 text-muted hover:text-violet-neon"
                  >
                    <Phone className="h-4 w-4" />
                    {event.contactPhone}
                  </a>
                ) : null}
                <div className="flex items-center gap-3 pt-1">
                  {event.instagramUrl ? (
                    <a
                      href={event.instagramUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-violet-neon"
                      aria-label="Instagram"
                    >
                      <InstagramIcon className="h-5 w-5" />
                    </a>
                  ) : null}
                  {event.youtubeUrl ? (
                    <a
                      href={event.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-violet-neon"
                      aria-label="YouTube"
                    >
                      <Play className="h-5 w-5" />
                    </a>
                  ) : null}
                  {event.xUrl ? (
                    <a
                      href={event.xUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-violet-neon"
                      aria-label="X"
                    >
                      <MessageCircle className="h-5 w-5" />
                    </a>
                  ) : null}
                  {event.facebookUrl ? (
                    <a
                      href={event.facebookUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-violet-neon"
                      aria-label="Facebook"
                    >
                      <Globe className="h-5 w-5" />
                    </a>
                  ) : null}
                  {event.linkedinUrl ? (
                    <a
                      href={event.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-violet-neon"
                      aria-label="LinkedIn"
                    >
                      <Link2 className="h-5 w-5" />
                    </a>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <TermsAccordion terms={event.terms} />

          {/* Previous editions (linked past events) */}
          {linkedPastEvents.length > 0 && (
            <PreviousEditions events={linkedPastEvents} />
          )}

          {/* Attendee reviews (only for completed events) */}
          {eventEnded && eventReviews.length > 0 && (
            <EventReviews reviews={eventReviews} organizerId={event.organizer.id} />
          )}

          {(() => {
            const nowMs = Date.now();
            const startMs = new Date(event.startsAt).getTime();
            const endMs = event.endsAt ? new Date(event.endsAt).getTime() : startMs;
            const eventStarted = startMs <= nowMs;
            const eventEnded = endMs <= nowMs;
            const bookingClosed = event.allowBookingDuringEvent ? eventEnded : eventStarted;
            if (!bookingClosed) return null;
            return (
              <section className="glass rounded-3xl p-5 text-center">
                <p className="text-sm font-bold">
                  {eventEnded ? "This event has ended" : "This event has started"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {eventEnded
                    ? "Tickets are no longer available."
                    : "Online booking is closed. Please buy tickets on spot at the venue."}
                </p>
                <Link
                  href={`/?category=${event.category}`}
                  className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-neon-gradient px-4 py-2 text-sm font-bold text-white"
                >
                  <CalendarDays className="h-4 w-4" />
                  Explore more {CATEGORY_LABELS[event.category]} events
                </Link>
              </section>
            );
          })()}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <TicketTiers event={event} waitlistData={waitlistData} waitlistEnabled={event.waitlistEnabled} />

          {/* Update Me button — only for logged-in non-ticket-holders */}
          {user && !eventEnded ? <UpdateMeButton eventId={event.id} isSubscribed={isSubscribed} /> : null}

          <p className="px-2 text-center text-xs text-muted">
            Payments are processed securely.{" "}
            <Link href="/tickets" className="underline hover:text-violet-neon">
              Track your orders
            </Link>
          </p>
        </aside>
      </div>
    </div>
    </EventRealtimeWrapper>
  );
}
