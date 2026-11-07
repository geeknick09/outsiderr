"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

import { logShareAction } from "@/modules/shared/actions/communities";

/** Member invite share - friendly line + copy + single share button. */
export function InviteShare({ path, communityName, communityId }: { path: string; communityName: string; communityId?: string }) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  function fullUrl() {
    return `${window.location.origin}${path}`;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  async function share() {
    if (communityId) void logShareAction("COMMUNITY", communityId, "NATIVE").catch(() => {});
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `Join ${communityName}`, url: fullUrl() });
        return;
      } catch { /* cancelled - fall through to copy */ }
    }
    await navigator.clipboard.writeText(fullUrl());
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }

  return (
    <div className="mt-4 rounded-2xl border border-violet-neon/20 bg-violet-neon/5 p-4 text-center">
      <p className="text-xs font-bold uppercase tracking-wide text-violet-neon">
        Friends make it better - bring yours.
      </p>
      <div className="mt-2.5 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-mono text-muted hover:border-violet-neon dark:border-white/10 dark:bg-white/5"
          title="Click to copy invite link"
        >
          <Copy className="h-3 w-3 shrink-0" />
          <span className="truncate">{path}</span>
          <span className="shrink-0 font-sans font-bold text-violet-neon">{copied ? "Copied!" : "Copy"}</span>
        </button>
        <button
          type="button"
          onClick={share}
          aria-label="Share invite link"
          className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all hover:shadow-[0_0_16px_rgba(139,92,246,0.4)]"
        >
          {shared ? (
            <Check className="h-4 w-4 text-lime-neon" />
          ) : (
            <Share2 className="h-4 w-4 text-violet-neon" />
          )}
        </button>
      </div>
    </div>
  );
}
