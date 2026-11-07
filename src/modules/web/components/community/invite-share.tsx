"use client";

import { useState } from "react";
import { Copy, Share2 } from "lucide-react";

const INPUT_BTN =
  "flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-bold text-muted transition-all hover:border-violet-neon hover:text-violet-neon dark:border-white/15";

/** Member invite share — copy link + share to WhatsApp/IG/FB/Gmail. */
export function InviteShare({ path, communityName }: { path: string; communityName: string }) {
  const [copied, setCopied] = useState(false);

  function fullUrl() {
    return `${window.location.origin}${path}`;
  }
  const message = `Join ${communityName} on Outsiderr - come vibe with us!`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${message} ${fullUrl()}`)}`, "_blank");
  }
  function shareFacebook() {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl())}`, "_blank");
  }
  function shareGmail() {
    window.open(`mailto:?subject=${encodeURIComponent(message)}&body=${encodeURIComponent(`Come join us:\n${fullUrl()}`)}`, "_self");
  }
  async function shareInstagram() {
    const url = fullUrl();
    if (navigator.share) {
      try { await navigator.share({ title: communityName, text: message, url }); } catch { /* dismissed */ }
    } else {
      await copy();
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-violet-neon/20 bg-violet-neon/5 p-4 text-center">
      <p className="text-xs font-bold uppercase tracking-wide text-violet-neon">
        Friends make it better - bring yours.
      </p>
      <button
        type="button"
        onClick={copy}
        className="mt-2.5 inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-mono text-muted hover:border-violet-neon dark:border-white/10 dark:bg-white/5"
        title="Click to copy invite link"
      >
        <Copy className="h-3 w-3 shrink-0" />
        <span className="truncate">{path}</span>
        <span className="shrink-0 font-sans font-bold text-violet-neon">{copied ? "Copied!" : "Copy"}</span>
      </button>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={shareWhatsApp} className={INPUT_BTN}>
          <Share2 className="h-3 w-3" /> WhatsApp
        </button>
        <button type="button" onClick={shareInstagram} className={INPUT_BTN}>
          <Share2 className="h-3 w-3" /> Instagram
        </button>
        <button type="button" onClick={shareFacebook} className={INPUT_BTN}>
          <Share2 className="h-3 w-3" /> Facebook
        </button>
        <button type="button" onClick={shareGmail} className={INPUT_BTN}>
          <Share2 className="h-3 w-3" /> Gmail
        </button>
      </div>
    </div>
  );
}
