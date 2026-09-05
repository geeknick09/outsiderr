"use client";

import { useActionState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import {
  activateHeroBoostAction,
  cancelHeroBoostAction,
} from "@/actions/hero-boosts";
import { SubmitButton } from "@/components/ui/submit-button";
import type { HeroBoostWithEvent } from "@/lib/types";

export function HeroBoostAdminActions({ boost }: { boost: HeroBoostWithEvent }) {
  const [activateState, activateAction] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const id = String(formData.get("boostId") ?? "");
      return activateHeroBoostAction(id);
    },
    null,
  );
  const [cancelState, cancelAction] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const id = String(formData.get("boostId") ?? "");
      return cancelHeroBoostAction(id);
    },
    null,
  );

  if (boost.status === "PENDING") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <form action={activateAction}>
          <input type="hidden" name="boostId" value={boost.id} />
          <SubmitButton
            variant="secondary"
            size="sm"
            loadingText="Activating…"
          >
            <CheckCircle2 className="h-4 w-4 text-lime-neon" />
            Verify &amp; Activate
          </SubmitButton>
        </form>
        <form action={cancelAction}>
          <input type="hidden" name="boostId" value={boost.id} />
          <SubmitButton
            variant="secondary"
            size="sm"
            loadingText="Rejecting…"
          >
            <XCircle className="h-4 w-4 text-red-500" />
            Reject
          </SubmitButton>
        </form>
        {activateState?.error ? (
          <span className="text-xs text-red-500">{activateState.error}</span>
        ) : null}
        {cancelState?.error ? (
          <span className="text-xs text-red-500">{cancelState.error}</span>
        ) : null}
      </div>
    );
  }

  if (boost.status === "ACTIVE") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <form action={cancelAction}>
          <input type="hidden" name="boostId" value={boost.id} />
          <SubmitButton
            variant="secondary"
            size="sm"
            loadingText="Cancelling…"
          >
            <XCircle className="h-4 w-4 text-red-500" />
            Cancel Boost
          </SubmitButton>
        </form>
        {cancelState?.error ? (
          <span className="text-xs text-red-500">{cancelState.error}</span>
        ) : null}
      </div>
    );
  }

  return null;
}
