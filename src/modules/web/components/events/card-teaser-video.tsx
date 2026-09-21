"use client";

import { useEffect, useRef } from "react";

/**
 * Muted, looping teaser video for the event card (District-style).
 *
 * Autoplays inline once ~half the card is visible and pauses when it scrolls
 * out — keeps bandwidth + CPU low on a long feed. `muted` + `playsInline` are
 * required for iOS autoplay. No `controls`, so taps pass through to the card's
 * link. If the video fails to load it hides itself so the poster shows.
 */
export function CardTeaserVideo({
  src,
  poster,
}: {
  src: string;
  poster?: string | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // play() returns a promise — swallow rejection when autoplay is blocked.
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster ?? undefined}
      muted
      loop
      playsInline
      autoPlay
      preload="metadata"
      className="absolute inset-0 h-full w-full object-cover"
      onError={(e) => {
        // Hide the broken video so the poster fallback underneath shows.
        (e.currentTarget as HTMLVideoElement).style.display = "none";
      }}
    />
  );
}
