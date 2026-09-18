"use client";

import { useState, useTransition } from "react";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";
import { followOrganizerAction, unfollowOrganizerAction } from "@/actions/engagement";

export function FollowOrganizerButton({
  organizerId,
  isFollowing,
}: {
  organizerId: string;
  isFollowing: boolean;
}) {
  const [following, setFollowing] = useState(isFollowing);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const action = following ? unfollowOrganizerAction : followOrganizerAction;
      const result = await action(organizerId);
      if (!result.error) {
        setFollowing(!following);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={following ? "Unfollow organizer" : "Follow organizer"}
      title={following ? "Unfollow organizer" : "Follow organizer"}
      className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold transition-all disabled:opacity-50 ${
        following
          ? "border border-zinc-200 bg-white text-zinc-600 hover:border-red-300 hover:text-red-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300"
          : "bg-neon-gradient text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)]"
      }`}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : following ? (
        <UserCheck className="h-4 w-4" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      {following ? "Following" : "Follow"}
    </button>
  );
}
