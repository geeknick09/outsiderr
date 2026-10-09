"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Megaphone, Share2 } from "lucide-react";

import { promoteEventAction } from "@/modules/web/actions/promoter";

/**
 * Promote & earn — LINK mode gives the promoter a unique /p/<slug> share URL;
 * PROMO_CODE mode gives them a discount code for buyers.
 */
export function PromoteButton({
  eventId,
  mode,
  linkRateBps,
  buyerDiscountBps,
}: {
  eventId: string;
  mode: "LINK" | "PROMO_CODE";
  linkRateBps: number;
  buyerDiscountBps: number;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ slug?: string; code?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = result?.slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${result.slug}`
    : null;

  function register() {
    startTransition(async () => {
      const res = await promoteEventAction(eventId);
      if (res.error) setResult({ error: res.error });
      else setResult({ slug: res.slug, code: res.code });
    });
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!result) {
    return (
      <button
        type="button"
        onClick={register}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-violet-neon/50 px-4 py-3 text-sm font-bold text-violet-neon transition-colors hover:border-violet-neon hover:bg-violet-neon/5 disabled:opacity-50"
      >
        <Megaphone className="h-4 w-4" />
        {pending
          ? "Getting your link…"
          : mode === "LINK"
            ? `Promote this event & earn ${(linkRateBps / 100).toFixed(0)}% per sale`
            : `Promote this event — buyers get ${(buyerDiscountBps / 100).toFixed(0)}% off via your code`}
      </button>
    );
  }

  if (result.error) {
    return <p className="text-center text-xs text-amber-600 dark:text-amber-400">{result.error}</p>;
  }

  return (
    <div className="space-y-2 rounded-2xl border border-violet-neon/40 bg-violet-neon/5 p-3">
      <p className="text-xs font-bold text-violet-neon">
        {mode === "LINK" ? "Your promoter link" : "Your promo code"}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-xs text-white">
          {shareUrl ?? result.code}
        </code>
        <button
          type="button"
          onClick={() => copy(shareUrl ?? result.code ?? "")}
          className="shrink-0 rounded-lg border border-violet-neon/40 p-2 text-violet-neon hover:bg-violet-neon/10"
          aria-label="Copy"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      {shareUrl ? (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Grab tickets: ${shareUrl}`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-xl bg-lime-500/20 py-2 text-xs font-bold text-lime-500 hover:bg-lime-500/30"
        >
          <Share2 className="h-3.5 w-3.5" /> Share on WhatsApp
        </a>
      ) : (
        <p className="text-[11px] text-muted">
          Buyers enter this code at checkout for {(buyerDiscountBps / 100).toFixed(0)}% off — you earn on every paid ticket.
        </p>
      )}
      <p className="text-[10px] text-muted">
        Commission settles {7} days after the event and is paid to your bank (set it on the promoter dashboard).
      </p>
    </div>
  );
}
