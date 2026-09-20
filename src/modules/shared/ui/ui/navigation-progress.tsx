"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin top-of-page progress bar that appears during route transitions.
 *
 * Performance fix: removed 100ms setInterval that caused 10 React re-renders/second.
 * Now uses a single target value + CSS transition to animate smoothly without
 * any JavaScript timers firing during the transition.
 *
 * - Starts immediately at 20% when navigation begins (one state update)
 * - CSS transition animates from 20% → 80% over 600ms automatically
 * - Sets to 100% when the new page has rendered (one more state update)
 * - Fades out after 300ms
 *
 * Also disables browser scroll restoration (which fights with Next.js and causes
 * the page to "scroll down" after server actions / redirects) and explicitly
 * scrolls to top on every pathname change.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  // Store timer refs so we can cancel stale ones
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPath = useRef(pathname + searchParams.toString());

  // Disable browser scroll restoration — it fights with Next.js and causes
  // the page to jump to a stale scroll position after server actions / redirects.
  useEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  }, []);

  function startProgress() {
    if (completeTimer.current) clearTimeout(completeTimer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setLoading(true);
    // Jump to 20% immediately, then CSS transition fills to 80% over 600ms
    setProgress(20);
    completeTimer.current = setTimeout(() => {
      // Snap to near-complete — CSS will animate
      setProgress(80);
    }, 50);
  }

  function finishProgress() {
    if (completeTimer.current) clearTimeout(completeTimer.current);
    setProgress(100);
    fadeTimer.current = setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, 300);
  }

  useEffect(() => {
    const currentPath = pathname + searchParams.toString();
    if (currentPath === prevPath.current) return;
    prevPath.current = currentPath;
    // Navigation completed — finish the bar + scroll to top
    finishProgress();
    window.scrollTo(0, 0);
  }, [pathname, searchParams]);

  // Detect form submissions (server actions)
  useEffect(() => {
    function handleSubmit(e: SubmitEvent) {
      const form = e.target as HTMLFormElement;
      if (form?.method === "post") {
        startProgress();
        // Fallback: auto-hide after 8s in case page doesn't navigate
        if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
        fallbackTimer.current = setTimeout(finishProgress, 8000);
      }
    }
    document.addEventListener("submit", handleSubmit);
    return () => {
      document.removeEventListener("submit", handleSubmit);
      if (completeTimer.current) clearTimeout(completeTimer.current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px]">
      <div
        className="h-full bg-neon-gradient"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          // Long transition when filling (600ms), short when completing (200ms), fade (300ms)
          transition:
            progress === 0
              ? "none"
              : progress >= 100
                ? "width 0.2s ease-out, opacity 0.3s ease-out 0.1s"
                : "width 0.6s ease-out, opacity 0.2s",
        }}
      />
    </div>
  );
}
