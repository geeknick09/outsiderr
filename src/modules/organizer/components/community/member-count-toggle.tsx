"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { toggleCommunityMemberCountAction } from "@/modules/shared/actions/communities";

export function MemberCountToggle({ communityId, show }: { communityId: string; show: boolean }) {
  const [on, setOn] = useState(show);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await toggleCommunityMemberCountAction(communityId, !on);
          if (!res.error) setOn(!on);
        })
      }
      title={on ? "Member count is visible on the public page" : "Member count is hidden on the public page"}
      className="flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-[10px] font-semibold text-muted transition-colors hover:border-violet-neon/50 disabled:opacity-50 dark:border-white/10"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      <span
        className={`h-2 w-2 rounded-full ${on ? "bg-lime-neon" : "bg-zinc-500"}`}
        aria-hidden="true"
      />
      {on ? "Member count: visible" : "Member count: hidden"}
    </button>
  );
}
