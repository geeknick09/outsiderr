import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, CalendarDays, Info, MapPin, Users } from "lucide-react";

import { MapEmbed } from "@/components/events/map-embed";
import { PhotoGallery } from "@/components/events/photo-gallery";
import { ShareEventButton } from "@/components/events/share-event-button";
import { TagPills } from "@/components/events/tag-pills";
import { TermsAccordion } from "@/components/events/terms-accordion";
import { TicketTiers } from "@/components/events/ticket-tiers";
import { WaitlistButton } from "@/components/events/waitlist-button";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, CITY_LABELS } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/events";
import { getWaitlistEntry, getWaitlistCount } from "@/lib/data/waitlist";
import { formatDateRange, mapsLink } from "@/lib/format";

export const dynamic = "force-dynamic";

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

  const banner = event.bannerPosterUrl ?? event.cardPosterUrl;

  // Waitlist data for sold-out tiers
  const soldOutTiers = event.tiers.filter((t) => t.quantitySold >= t.quantity);
  const waitlistData = await Promise.all(
    soldOutTiers.map(async (tier) => ({
      tier,
      entry: user ? await getWaitlistEntry(user, tier.id) : null,
      count: await getWaitlistCount(tier.id),
    })),
  );

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://outsiderr.in";
  const eventUrl = `${baseUrl}/events/${event.id}`;

  return (
    <div className="-mt-6">
      <div className="relative -mx-4 aspect-[16/9] max-h-[420px] overflow-hidden sm:rounded-b-3xl">
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

      <div className="grid gap-6 pt-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="violet">{CATEGORY_LABELS[event.category]}</Badge>
              <Badge tone="neutral">{CITY_LABELS[event.city]}</Badge>
              {event.isFeatured ? <Badge tone="lime">Sponsored</Badge> : null}
            </div>

            <TagPills tags={event.tags} />

            <div className="flex items-start justify-between gap-3">
              <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
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
              <a
                href={mapsLink(
                  event.latitude,
                  event.longitude,
                  `${event.venueName}, ${event.venueAddress}`,
                )}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-2 hover:text-violet-neon"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pink-neon" />
                <span>
                  {event.venueName}
                  <span className="block text-xs text-muted">{event.venueAddress}</span>
                </span>
              </a>
              <span className="flex items-center gap-2 text-muted">
                <Users className="h-4 w-4" />
                {event.registrationsCount} people registered
              </span>
            </div>

            <MapEmbed
              latitude={event.latitude}
              longitude={event.longitude}
              venueName={event.venueName}
            />
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
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neon-gradient text-lg font-black text-white">
                {event.organizer.name.slice(0, 1)}
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  {event.organizer.name}
                  {event.organizer.verified ? (
                    <BadgeCheck className="h-4 w-4 text-violet-neon" />
                  ) : null}
                </p>
                {event.organizer.bio ? (
                  <p className="text-xs text-muted">{event.organizer.bio}</p>
                ) : null}
              </div>
            </Link>
          </section>

          <TermsAccordion terms={event.terms} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <TicketTiers event={event} />

          {/* Waitlist for sold-out tiers */}
          {waitlistData.length > 0 ? (
            <section className="glass rounded-3xl p-5">
              <h2 className="mb-3 text-sm font-bold text-muted">Join the Waitlist</h2>
              <div className="space-y-3">
                {waitlistData.map(({ tier, entry, count }) => (
                  <WaitlistButton
                    key={tier.id}
                    tierId={tier.id}
                    eventId={event.id}
                    tierName={tier.name}
                    waitlistEntry={entry}
                    waitlistCount={count}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <p className="px-2 text-center text-xs text-muted">
            Payments are verified manually by the organizer.{" "}
            <Link href="/tickets" className="underline hover:text-violet-neon">
              Track your orders
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
