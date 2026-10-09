import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";

import { COMMUNITY_CATEGORIES } from "@/modules/shared";

/**
 * Home-page community discovery — 8 category chips that deep-link into the
 * communities index filtered to that scene.
 */
export function JoinCommunitySection() {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight">Join a Community</h2>
          <p className="text-sm text-muted">Find your people — pick a scene to start.</p>
        </div>
        <Link
          href="/communities"
          className="flex shrink-0 items-center gap-1 text-sm font-semibold text-violet-neon hover:underline"
        >
          All communities <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {COMMUNITY_CATEGORIES.map((c) => (
          <Link
            key={c.value}
            href={`/communities?category=${c.value}`}
            className="glass group flex items-center gap-3 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-violet-neon/60 hover:shadow-[0_0_24px_rgba(139,92,246,0.3)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neon-gradient/20 text-violet-neon transition-colors group-hover:bg-neon-gradient group-hover:text-white">
              <Users className="h-4 w-4" />
            </span>
            <span className="text-xs font-bold leading-tight">{c.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
