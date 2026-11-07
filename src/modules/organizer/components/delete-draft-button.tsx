"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteEventAction } from "../actions/events";

export function DeleteDraftButton({ eventId }: { eventId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this draft? Media, tiers and settings are removed permanently.")) return;
          startTransition(async () => {
            const res = await deleteEventAction(eventId);
            if (res.error) setError(res.error);
            else router.push("/organizer/events");
          });
        }}
        className="rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-500/10 disabled:opacity-50"
      >
        <Trash2 className="mr-1 inline h-3.5 w-3.5" />{pending ? "Deleting…" : "Delete draft"}
      </button>
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </span>
  );
}
