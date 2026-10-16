"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

import { logShareAction } from "@/modules/shared/actions/communities";

export function ShareEventButton({
  title,
  url,
  entityType = "EVENT",
  entityId,
}: {
  title: string;
  url: string;
  entityType?: "EVENT" | "COMMUNITY" | "ORGANIZER";
  entityId?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (entityId) void logShareAction(entityType, entityId, "NATIVE").catch(() => {});
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // User cancelled share or browser denied - fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Share event"
      className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all hover:shadow-[0_0_16px_rgba(139,92,246,0.4)]"
    >
      {copied ? (
        <Check className="h-4 w-4 text-lime-neon" />
      ) : (
        <Share2 className="h-4 w-4 text-violet-neon" />
      )}
    </button>
  );
}
