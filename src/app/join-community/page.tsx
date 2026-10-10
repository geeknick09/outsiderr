import Link from "next/link";
import { Award, Flame, Sparkles, Users } from "lucide-react";

import { listCommunities } from "@/modules/shared/server";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Join a Community - Outsiderr",
  description: "Discover communities, earn badges and reputation - belong.",
};

const STEPS = [
  {
    icon: Sparkles,
    title: "Discover",
    body: "Communities for every scene - fitness crews, hip-hop collectives, nightlife circuits, sneakerheads, gamers, makers. Find the ones that feel like yours.",
  },
  {
    icon: Users,
    title: "Join",
    body: "Open communities take you in instantly. Private ones ask a few questions and let the host approve you. Either way, you're in for the members-only events.",
  },
  {
    icon: Flame,
    title: "Experience",
    body: "Members get first access to community events, group rates, guestlist spots and recurring meetups that never hit the public feed.",
  },
  {
    icon: Award,
    title: "Belong & earn",
    body: "Every event you attend builds your badges - from First Event to Community Champion. Hit the top tiers and Outsiderr rewards you with goodies, perks and early-access drops.",
  },
];

export default async function JoinCommunityPage() {
  const communities = await listCommunities();
  const totalMembers = communities.reduce((s, c) => s + (c.memberCount ?? 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-10 text-center">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-neon">
          Outsiderr communities
        </p>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          Your scene is already here.
        </h1>
        <p className="mx-auto max-w-xl text-base text-muted">
          Communities are where the real culture lives - the crews hosting the
          events worth showing up to.{" "}
          {communities.length > 0
            ? `${communities.length} communities · ${totalMembers.toLocaleString("en-IN")} members already in.`
            : "Be the first to start something."}
        </p>
      </div>

      <div className="grid gap-4 text-left sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <div key={s.title} className="glass rounded-3xl p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-neon/15 text-violet-neon">
                <s.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                  Step {i + 1}
                </p>
                <h2 className="text-base font-black">{s.title}</h2>
              </div>
            </div>
            <p className="text-sm text-muted">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="glass rounded-3xl border-violet-neon/30 p-6">
        <p className="text-sm font-semibold">
          Badges turn into rewards - reps, goodies, and perks straight from Outsiderr
          once you&apos;re deep enough in the scene.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/communities"
          className="rounded-full bg-neon-gradient px-8 py-3.5 text-sm font-bold text-white shadow-glow-violet transition-transform hover:scale-[1.03]"
        >
          Discover communities
        </Link>
        <Link
          href="/communities/create"
          className="rounded-full border border-zinc-200 px-8 py-3.5 text-sm font-bold transition-colors hover:border-violet-neon dark:border-white/15"
        >
          Start your own
        </Link>
      </div>
    </div>
  );
}
