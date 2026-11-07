"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Badge, cityLabel } from "@/modules/shared";
import type { Community } from "@/modules/shared";

export function CommunityList({ communities }: { communities: Community[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? communities.filter((c) =>
        [c.name, c.category, c.subcategory, c.city]
          .filter(Boolean)
          .some((f) => f!.toLowerCase().includes(q)),
      )
    : communities;

  if (!communities.length) {
    return (
      <p className="glass rounded-3xl p-5 text-sm text-muted">
        No communities yet. Create one to start building your community.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, tag or city…"
          className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="glass rounded-3xl p-5 text-sm text-muted">No communities match &quot;{query}&quot;.</p>
      ) : (
        filtered.map((community) => (
          <div key={community.id} className="glass rounded-3xl p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <a href={`/communities/${community.id}`} className="flex min-w-0 items-center gap-3 font-bold hover:text-violet-neon">
                {community.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={community.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-neon/20 text-sm font-black text-violet-neon">
                    {community.name.slice(0, 1)}
                  </span>
                )}
                <span className="truncate">{community.name}</span>
              </a>
              <a
                href={`/organizer/communities/${community.id}`}
                className="rounded-full bg-violet-neon/10 px-3 py-1.5 text-xs font-bold text-violet-neon hover:bg-violet-neon/20"
              >
                Manage →
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge tone="neutral">{community.memberCount} member{community.memberCount === 1 ? "" : "s"}</Badge>
              {community.city ? <Badge tone="neutral">{cityLabel(community.city)}</Badge> : null}
              {community.category ? <Badge tone="violet">{community.category}</Badge> : null}
            </div>
            {community.subcategory ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...new Map(community.subcategory.split(",").map((t) => t.trim()).filter(Boolean).map((t) => [t.toLowerCase(), t])).values()]
                  .slice(0, 6)
                  .map((t) => (
                    <span key={t} className="rounded-full bg-violet-neon/10 px-2.5 py-0.5 text-[10px] font-semibold text-violet-neon">
                      {t}
                    </span>
                  ))}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
