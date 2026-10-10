"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Undo2, Users } from "lucide-react";

import { followOrganizerAction, unfollowOrganizerAction } from "@/modules/shared/actions/engagement";
import { followCommunityAction, unfollowCommunityAction } from "@/modules/shared/actions/communities";
import { Button } from "@/modules/shared";

interface Item {
  id: string;
  name: string;
  kind: "organizer" | "community";
  href: string;
}

export function FollowingSection({
  organizers,
  communities,
}: {
  organizers: { id: string; name: string }[];
  communities: { id: string; name: string }[];
}) {
  const initial: Item[] = [
    ...organizers.map((o) => ({ id: o.id, name: o.name, kind: "organizer" as const, href: `/organizers/${o.id}` })),
    ...communities.map((c) => ({ id: c.id, name: c.name, kind: "community" as const, href: `/communities/${c.id}` })),
  ];
  const [items, setItems] = useState<Item[]>(initial);
  // Session-level undo buffer - last unfollowed item can be re-followed until reload.
  const [lastUnfollowed, setLastUnfollowed] = useState<Item | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(item: Item, unfollow: boolean) {
    startTransition(async () => {
      const action = item.kind === "organizer"
        ? (unfollow ? unfollowOrganizerAction : followOrganizerAction)
        : (unfollow ? unfollowCommunityAction : followCommunityAction);
      const res = await action(item.id);
      if (res.error) return;
      if (unfollow) {
        setItems((prev) => prev.filter((i) => i.id !== item.id || i.kind !== item.kind));
        setLastUnfollowed(item);
      } else {
        setItems((prev) => [...prev, item]);
        setLastUnfollowed(null);
      }
    });
  }

  return (
    <section className="glass rounded-3xl p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
        <Users className="h-4 w-4 text-violet-neon" />
        Following
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing yet - follow organizers and communities to get notified about their events.
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3">
              <Link href={item.href} className="min-w-0 truncate text-sm font-semibold hover:text-violet-neon">
                {item.name}
                <span className="ml-2 text-[10px] font-bold uppercase text-muted">
                  {item.kind}
                </span>
              </Link>
              <button
                onClick={() => toggle(item, true)}
                disabled={pending}
                className="shrink-0 rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-muted hover:border-red-300 hover:text-red-500 dark:border-white/10"
              >
                Unfollow
              </button>
            </div>
          ))}
        </div>
      )}
      {lastUnfollowed ? (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-zinc-100 px-3 py-2 text-xs dark:bg-white/5">
          <span className="text-muted">Unfollowed {lastUnfollowed.name}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => toggle(lastUnfollowed, false)}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
            Undo
          </Button>
        </div>
      ) : null}
    </section>
  );
}
