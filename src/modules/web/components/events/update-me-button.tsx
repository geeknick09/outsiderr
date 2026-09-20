"use client";

/* eslint-disable react/no-unescaped-entities */

import { useState, useTransition } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { subscribeToEventAction, unsubscribeFromEventAction } from "@/modules/shared/actions/engagement";

export function UpdateMeButton({
  eventId,
  isSubscribed,
}: {
  eventId: string;
  isSubscribed: boolean;
}) {
  const [subscribed, setSubscribed] = useState(isSubscribed);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const action = subscribed ? unsubscribeFromEventAction : subscribeToEventAction;
      const result = await action(eventId);
      if (result.error) {
        setError(result.error);
      } else {
        setSubscribed(!subscribed);
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition-all disabled:opacity-50 ${
          subscribed
            ? "border-violet-neon/30 bg-violet-neon/10 text-violet-neon hover:bg-violet-neon/20"
            : "border-zinc-200 bg-white text-zinc-700 hover:border-violet-neon/50 hover:text-violet-neon dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200"
        }`}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : subscribed ? (
          <BellRing className="h-4 w-4" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {subscribed ? "Subscribed — Updates On" : "Update Me"}
      </button>
      {error ? <p className="px-2 text-xs text-red-500">{error}</p> : null}
      {subscribed ? (
        <p className="px-2 text-center text-[11px] text-muted">
          You'll be notified about changes, reminders & ticket availability.
        </p>
      ) : (
        <p className="px-2 text-center text-[11px] text-muted">
          Get notified about changes, reminders & when tickets go live.
        </p>
      )}
    </div>
  );
}
