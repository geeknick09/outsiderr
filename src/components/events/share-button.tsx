"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  url: string;
  title: string;
  text?: string;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ShareButton({
  url,
  title,
  text,
  variant = "primary",
  size = "md",
  className,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const fullUrl = typeof window !== "undefined" ? new URL(url, window.location.origin).toString() : url;

  async function handleShare() {
    const shareData = {
      title,
      text: text ?? `Check out ${title} on Outsiderr`,
      url: fullUrl,
    };

    // Try native share (mobile)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or share failed — fall through to copy
      }
    }

    // Fallback: copy to clipboard
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(fullUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Final fallback: open WhatsApp
        window.open(
          `https://wa.me/?text=${encodeURIComponent(`${title} — ${fullUrl}`)}`,
          "_blank",
        );
      }
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={handleShare}
    >
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {copied ? "Link copied!" : "Share"}
    </Button>
  );
}
