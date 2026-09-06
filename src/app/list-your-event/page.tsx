import Link from "next/link";
import { BarChart3, CalendarDays, MapPin, QrCode, Rocket, ScanLine, Shield, TrendingUp, Users, Zap } from "lucide-react";

import { ThemeLogo } from "@/components/layout/theme-logo";

export const metadata = { title: "List Your Event — Outsiderr" };

export default async function ListYourEventPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-16 sm:py-24">
        <div className="pointer-events-none absolute inset-0 bg-neon-gradient opacity-10" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-8 flex justify-center">
            <ThemeLogo width={180} height={42} />
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">
            List Your Event on{" "}
            <span className="bg-neon-gradient bg-clip-text text-transparent">Outsiderr</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted sm:text-lg">
            Cyphers, battles, skate comps, run clubs, jams, workshops — if it&apos;s happening
            outside the mainstream, it belongs here. Reach the communities that matter.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/organizer"
              className="w-full rounded-2xl bg-neon-gradient px-8 py-4 text-center text-base font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90 sm:w-auto"
            >
              Get Started — It&apos;s Free
            </Link>
            <Link
              href="/"
              className="w-full rounded-2xl border border-zinc-200 px-8 py-4 text-center text-base font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10 sm:w-auto"
            >
              Explore Events
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted">
            Free listing. We only charge a negligible fraction — and only when you actually sell.
          </p>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-zinc-200 px-4 py-8 dark:border-white/10">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 text-center sm:grid-cols-4">
          <Stat value="₹0" label="Listing fees" />
          <Stat value="100%" label="Free events = zero cost" />
          <Stat value="Instant" label="QR ticket generation" />
          <Stat value="UPI" label="Direct to your account" />
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-black tracking-tight">
            How it works
          </h2>
          <p className="mt-2 text-center text-sm text-muted">
            From idea to live event in under 5 minutes.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <Step
              icon={Users}
              step="1"
              title="Create your organizer profile"
              description="Set up your organizer page with your name, UPI ID, and bio. One-time setup, takes 2 minutes."
            />
            <Step
              icon={CalendarDays}
              step="2"
              title="List your event"
              description="Add event details, venue, ticket tiers (free or paid), and tags. Publish instantly — no approval needed."
            />
            <Step
              icon={ScanLine}
              step="3"
              title="Scan tickets at the door"
              description="Built-in QR scanner per event. Check attendees in, track attendance in real-time, no third-party app needed."
            />
          </div>
        </div>
      </section>

      {/* Features — what you get */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-black tracking-tight">
            Everything you get — built in
          </h2>
          <p className="mt-2 text-center text-sm text-muted">
            Tools that would cost you thousands elsewhere. All included.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={QrCode}
              title="QR ticket system"
              description="Every ticket gets a unique QR code. Built-in scanner per event validates check-ins. No third-party scanner app needed."
            />
            <Feature
              icon={BarChart3}
              title="Full analytics & insights"
              description="See exactly how your event is doing — bookings, revenue, waitlists, attendance. Know who came, who didn't, and what's trending."
            />
            <Feature
              icon={TrendingUp}
              title="Trends & insights"
              description="Understand what's working in your city. Track registrations over time, spot patterns, and plan better events."
            />
            <Feature
              icon={Users}
              title="Attendee management"
              description="See who booked, how many showed up, who didn't. Full attendee lists with contact details and check-in status."
            />
            <Feature
              icon={Zap}
              title="Manual UPI payments"
              description="Attendees pay directly to your UPI ID via QR. They submit the UTR, you verify — no payment gateway, no middleman."
            />
            <Feature
              icon={ScanLine}
              title="Per-event door scanner"
              description="Each event has its own scanner. Tickets are validated against the specific event — no cross-event mix-ups."
            />
            <Feature
              icon={Rocket}
              title="Front Row boost"
              description="Feature your event on the homepage hero carousel. Get maximum visibility for a flat fee."
            />
            <Feature
              icon={Shield}
              title="Cancel & postpone support"
              description="Life happens. Cancel or postpone with automatic notifications to ticket holders and refund tracking."
            />
            <Feature
              icon={CalendarDays}
              title="Phased ticketing"
              description="Early bird, regular, last-minute — set up multiple phases with automatic carry-forward of unsold tickets."
            />
          </div>
        </div>
      </section>

      {/* Why the small fee is worth it */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="glass rounded-3xl p-8 text-center">
            <h2 className="text-2xl font-black tracking-tight">
              Free to list. Negligible fee only when you sell.
            </h2>
            <p className="mt-4 text-sm text-muted">
              You read that right. Listing is completely free. For paid events, a small fraction
              is deducted from your payout — and that fraction stands for nothing compared to what
              you&apos;re getting: QR tickets, door scanner, full analytics, attendee insights,
              trend tracking, phased ticketing, boost options, and more. Tools that would cost
              you thousands on other platforms. All included. All working only when you actually sell.
            </p>
            <p className="mt-4 text-sm font-semibold text-violet-neon">
              Free events? Zero cost. Zero commission. Zero fees. Forever.
            </p>
          </div>
        </div>
      </section>

      {/* Who is it for */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-black tracking-tight">
            Built for rawness
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {[
              "Rap cyphers & battles",
              "Skateboard comps",
              "MTB & stunt events",
              "BMX jams",
              "Run clubs & marathons",
              "Walkathons",
              "Underground gigs & jams",
              "DJ sets & open decks",
              "Hip hop parties",
              "Trap nights",
              "Boom bap nights",
              "Car & bike meetups",
              "JDM meets",
              "Superbike meets",
              "Riders meets",
              "Graffiti cyphers",
              "Beatbox battles",
              "Dance battles",
              "Workshops & masterclasses",
              "Block parties",
            ].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-muted dark:border-white/10"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Ready to list your event?
          </h2>
          <p className="mt-4 text-base text-muted">
            Join the community of organizers bringing underground culture to the surface.
            It&apos;s free to get started.
          </p>
          <Link
            href="/organizer"
            className="mt-8 inline-block rounded-2xl bg-neon-gradient px-10 py-4 text-base font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 px-4 py-8 dark:border-white/10">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-violet-neon" />
            <span className="text-sm text-muted">Kolkata · Mumbai · Delhi · Bengaluru</span>
          </div>
          <div className="flex gap-6 text-sm text-muted">
            <Link href="/about" className="hover:text-violet-neon">About</Link>
            <Link href="/legal/terms" className="hover:text-violet-neon">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-violet-neon">Privacy</Link>
            <Link href="/contact" className="hover:text-violet-neon">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-black text-violet-neon sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function Step({
  icon: Icon,
  step,
  title,
  description,
}: {
  icon: React.ElementType;
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="glass rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neon-gradient text-sm font-black text-white">
          {step}
        </div>
        <Icon className="h-5 w-5 text-violet-neon" />
      </div>
      <h3 className="mt-4 text-base font-bold">{title}</h3>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="glass rounded-3xl p-6">
      <Icon className="h-6 w-6 text-violet-neon" />
      <h3 className="mt-3 text-base font-bold">{title}</h3>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </div>
  );
}
