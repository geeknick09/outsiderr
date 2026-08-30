"use client";

import { useActionState } from "react";
import { Rocket } from "lucide-react";

import { createOrganizerAction, type CreateOrganizerState } from "@/actions/organizer";
import { Button } from "@/components/ui/button";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function BecomeOrganizerForm() {
  const [state, formAction, pending] = useActionState<CreateOrganizerState, FormData>(
    createOrganizerAction,
    { error: null },
  );

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neon-gradient text-white shadow-glow-violet">
          <Rocket className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-black tracking-tight">Become an Organizer</h2>
        <p className="text-sm text-muted">
          Create your organizer profile to publish events, sell tickets, and manage
          your community.
        </p>
      </div>

      <form action={formAction} className="glass space-y-4 rounded-3xl p-6">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Organizer name *
          </span>
          <input
            name="name"
            required
            placeholder="Basement Collective"
            className={INPUT}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Bio
          </span>
          <textarea
            name="bio"
            rows={3}
            placeholder="Kolkata's oldest underground music collective — running warehouse gigs since 2016."
            className={INPUT}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            UPI ID *
          </span>
          <input
            name="upiId"
            required
            placeholder="basement@upi"
            className={INPUT}
          />
          <span className="block text-xs text-muted">
            Attendees will pay to this UPI ID. You can change it later.
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Avatar URL (optional)
          </span>
          <input
            name="avatarUrl"
            placeholder="https://…"
            className={INPUT}
          />
        </label>

        {state.error ? (
          <p className="text-sm text-red-500">{state.error}</p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating profile…" : "Yes, I'm an Organizer"}
        </Button>
      </form>
    </div>
  );
}
