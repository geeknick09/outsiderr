"use client";

import { useEffect, useState, useTransition } from "react";
import { BellPlus, BellRing } from "lucide-react";
import { followCommunityAction, unfollowCommunityAction } from "@/modules/shared/actions/communities";

export function CommunityFollowButton({
  communityId,
  isFollowing,
  compact = false,
}: {
  communityId: string;
  isFollowing: boolean;
  compact?: boolean;
}) {
  const [following, setFollowing] = useState(isFollowing);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setFollowing(isFollowing);
  }, [isFollowing]);

  function handleClick() {
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const action = next ? followCommunityAction : unfollowCommunityAction;
      const result = await action(communityId);
      if (result.error) setFollowing(!next);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={following ? "Unfollow community" : "Follow community"}
      className={`flex shrink-0 items-center gap-2 rounded-full font-bold transition-all disabled:opacity-50 ${
        compact ? "px-3 py-1.5 text-xs" : "px-5 py-2 text-sm"
      } ${
        following
          ? "border border-zinc-200 bg-white text-zinc-600 hover:border-red-300 hover:text-red-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300"
          : "bg-neon-gradient text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)]"
      }`}
    >
      {following ? <BellRing className="h-4 w-4" /> : <BellPlus className="h-4 w-4" />}
      {following ? "Following" : "Follow"}
    </button>
  );
}
