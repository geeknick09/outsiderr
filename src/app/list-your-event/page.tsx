import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  Globe,
  Layers,
  MapPin,
  Megaphone,
  Rocket,
  ScanLine,
  Shield,
  Ticket,
  TrendingUp,
  Users,
  UsersRound,
  Zap,
} from "lucide-react";

import { ThemeLogo } from "@/modules/shared";
import { getCurrentUser, getOrganizerProfile, getSettingInt } from "@/modules/shared/server";
import { getOrganizerAccessState } from "@/modules/shared";

export const metadata = { title: "Become a Creator - Outsiderr" };

export default async function ListYourEventPage() {
  const user = await getCurrentUser();
  let accessState: ReturnType<typeof getOrganizerAccessState> | null = null;
  if (user) {
    const org = await getOrganizerProfile(user);
    if (org) {
      // Applications in the pipeline go straight to /organizer, which renders
      // the right screen per state: review panel (PENDING), respond form
      // (CLARIFICATION_NEEDED), dashboard (APPROVED), or the max-rejection
      // blocked page. Only REJECTED stays here - the marketing page is the
      // agreed fresh-start entry point (Get Started → new 5-step wizard).
      if (org.kycStatus !== "REJECTED") {
        redirect("/organizer");
      }
      accessState = getOrganizerAccessState({
        kycStatus: org.kycStatus,
        rejectionCount: org.rejectionCount,
        rejectionLimit: await getSettingInt("organizer_rejection_limit"),
      });
    }
  }
  const blocked = accessState?.blocked === true;
  const isApproved = accessState?.eligible === true;
  const communityCap = (await getSettingInt("community_max_per_organizer")) || 10;

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
            Become a Creator on{" "}
            <span className="bg-neon-gradient bg-clip-text text-transparent">Outsiderr</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted sm:text-lg">
            One dashboard for everything you run - public events, community events, and your own
            communities. Host, promote, sell, scan, and get paid - all in one place.
          </p>
          {blocked ? (
            <p className="mt-8 text-sm font-semibold text-red-500">
              Your creator application reached the rejection limit - get started to see your options.
            </p>
          ) : null}
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/organizer"
              className="w-full rounded-2xl bg-neon-gradient px-8 py-4 text-center text-base font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90 sm:w-auto"
            >
              {isApproved ? "Go to Creator Dashboard" : "Start Creating - It's Free"}
            </Link>
            <Link
              href="/communities"
              className="w-full rounded-2xl border border-zinc-200 px-8 py-4 text-center text-base font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10 sm:w-auto"
            >
              Explore Communities
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted">
            Free to create. We only take a small share when you actually sell.
          </p>
        </div>
      </section>

      {/* What you can build */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-black tracking-tight">
            One creator hub. Three things you can build.
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <BuildCard
              icon={Ticket}
              title="Public events"
              description="Gigs, cyphers, comps, workshops - ticketed or free, city-tagged, discoverable on the homepage and in search."
            />
            <BuildCard
              icon={UsersRound}
              title="Community events"
              description="Run events inside your community - weekly jams, meetups, members-only drops. Attach any event to one of your communities."
            />
            <BuildCard
              icon={Layers}
              title={`Communities (up to ${communityCap})`}
              description="Clubs and crews with their own landing pages, members, timelines and event feeds. You can run several under one creator account."
            />
          </div>
        </div>
      </section>

      {/* Community landing pages */}
      <section className="border-y border-zinc-200 px-4 py-16 dark:border-white/10">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-black tracking-tight">
            Your community gets a real landing page
          </h2>
          <p className="mt-3 text-center text-sm text-muted">
            Not a bare link - a full public page that does the talking for you.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={Globe}
              title="Branded covers"
              description="16:9 desktop cover + a separate 3:4 mobile cover so your page looks sharp on every device - with a proper cropper built in."
            />
            <Feature
              icon={Users}
              title="Join modes your way"
              description="Open to everyone, request-to-join with custom questions, or invite-only links. Approve members, set subcategories, follow your niche."
            />
            <Feature
              icon={CalendarDays}
              title="A living timeline"
              description="Your community page shows a scrollable event timeline - past editions grayed out, upcoming events below a glowing 'Now' marker."
            />
            <Feature
              icon={Ticket}
              title="Events wired in"
              description="Every event you attach feeds the community timeline and page. Members discover your drops without leaving your space."
            />
            <Feature
              icon={Megaphone}
              title="All your socials, one page"
              description="Instagram, YouTube, X, Facebook, LinkedIn, website - linked right from your page header so followers find you everywhere."
            />
            <Feature
              icon={TrendingUp}
              title="Member growth & virality"
              description="Track member counts, referred joins vs direct joins, and your community's virality coefficient in analytics."
            />
          </div>
        </div>
      </section>

      {/* Money */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-black tracking-tight">
            Money, handled properly
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={CreditCard}
              title="Razorpay payments"
              description="UPI, cards, netbanking, wallets - real gateway payments at checkout. Buyers pay, confirmations are instant and automatic."
            />
            <Feature
              icon={Zap}
              title="Automatic splits"
              description="Commission, convenience fee and your share are calculated and recorded per order - no reconciliation spreadsheets."
            />
            <Feature
              icon={Shield}
              title="Refunds & cancellations"
              description="Postpone or cancel with automatic notifications, tracked refunds, and cancellation charges applied exactly to your policy."
            />
            <Feature
              icon={BarChart3}
              title="Your ledger, always current"
              description="Every sale, fee and payout shows up in your ledger with razor-sharp math. Export what you need for your books."
            />
            <Feature
              icon={ScanLine}
              title="Box office & door scanner"
              description="Sell at the counter, comp the guestlist, and check in attendees with the built-in QR scanner - all free."
            />
            <Feature
              icon={Rocket}
              title="Payouts on schedule"
              description="Your earnings accumulate and pay out to your bank account. Track every payout's status from your dashboard."
            />
          </div>
        </div>
      </section>

      {/* Promotion */}
      <section className="border-y border-zinc-200 px-4 py-16 dark:border-white/10">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-black tracking-tight">
            Promotion that actually reaches people
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <Feature
              icon={Rocket}
              title="Campaigns: Feature &amp; Slot"
              description="Feature puts your event on the homepage Front Row. Slot buys a numbered spot in the sponsored strip - on the homepage, communities, or both."
            />
            <Feature
              icon={Megaphone}
              title="Promoters &amp; referral links"
              description="Give street-team promoters tracked links and promo codes. Commissions attribute automatically - you see exactly who drives sales."
            />
            <Feature
              icon={TrendingUp}
              title="Analytics + virality"
              description="Sales curves, channel split, city breakdown, virality coefficient per event and community - know what moves the needle."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-black tracking-tight">
            How it works
          </h2>
          <p className="mt-2 text-center text-sm text-muted">
            From signup to paid-out in five steps.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3 lg:grid-cols-5">
            <Step
              step="1"
              title="Creator profile"
              description="Name, photo, bio. One-time setup, two minutes."
            />
            <Step
              step="2"
              title="Quick KYC"
              description="PAN gets you reviewed. Bank & GST can wait till you sell."
            />
            <Step
              step="3"
              title="Create"
              description="An event, a community, or both. Publish instantly."
            />
            <Step
              step="4"
              title="Promote & scan"
              description="Campaigns, promoters, box office and QR door checks."
            />
            <Step
              step="5"
              title="Get paid"
              description="Razorpay settlements to your bank. Ledger keeps it honest."
            />
          </div>
        </div>
      </section>

      {/* Fee explainer */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="glass rounded-3xl p-8 text-center">
            <h2 className="text-2xl font-black tracking-tight">
              Free to create. Small fee only when you sell.
            </h2>
            <p className="mt-4 text-sm text-muted">
              Creating events and communities costs nothing. For paid tickets, a small commission is
              deducted at checkout - and it buys you a full stack: Razorpay checkout, QR tickets,
              door scanner, box office, analytics, campaigns, promoters and payouts. Free events?
              Zero cost. Zero commission. Forever.
            </p>
            <p className="mt-4 text-sm font-semibold text-violet-neon">
              No listing fees. No subscriptions to start. Pay only when money moves.
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
              "Run communities & marathons",
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
            Ready to create?
          </h2>
          <p className="mt-4 text-base text-muted">
            Join the creators bringing underground culture to the surface. It&apos;s free to start.
          </p>
          <Link
            href="/organizer"
            className="mt-8 inline-block rounded-2xl bg-neon-gradient px-10 py-4 text-base font-bold text-white shadow-glow-violet transition-opacity hover:opacity-90"
          >
            {isApproved ? "Go to Creator Dashboard" : "Start Creating"}
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

function BuildCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="glass rounded-3xl border border-white/10 p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-neon/15">
        <Icon className="h-6 w-6 text-violet-neon" />
      </div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </div>
  );
}

function Step({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="glass rounded-3xl p-5 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-neon-gradient text-sm font-black text-white">
        {step}
      </div>
      <h3 className="mt-3 text-sm font-bold">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{description}</p>
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
