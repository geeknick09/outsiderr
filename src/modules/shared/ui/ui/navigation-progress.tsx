"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandedLoader } from "./branded-loader";

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
  // Full-screen branded overlay — only appears when a navigation outlives a
  // short threshold, so instant/prefetched hops never flash it.
  const [showOverlay, setShowOverlay] = useState(false);
  // Store timer refs so we can cancel stale ones
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPath = useRef(pathname + searchParams.toString());

  // Disable browser scroll restoration — it fights with Next.js and causes
  // the page to jump to a stale scroll position after server actions / redirects.
  // scrollTo(0,0) on mount corrects the position the browser restores before
  // hydration finishes (hard reload lands mid-page otherwise).
  useEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
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
    // Center-screen branded loader kicks in only if the nav is still going
    // after 150ms — prefetch-instant navigations never show it.
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setShowOverlay(true), 150);
    // Safety: never leave the overlay stuck if nothing navigates.
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(() => {
      finishProgress();
      setShowOverlay(false);
    }, 12000);
  }

  function finishProgress() {
    if (completeTimer.current) clearTimeout(completeTimer.current);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    setShowOverlay(false);
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
    // Navigation completed — finish the bar + scroll to top.
    // Retry over ~800ms: images/layout settling or a late browser scroll
    // restore can land the page mid-way; a single early scrollTo loses.
    finishProgress();
    window.scrollTo(0, 0);
    const raf = requestAnimationFrame(() => window.scrollTo(0, 0));
    const timers = [120, 350, 800].map((ms) =>
      setTimeout(() => window.scrollTo(0, 0), ms),
    );
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, [pathname, searchParams]);

  // Start on internal link clicks — the old version only reacted AFTER the
  // route changed, so slow server renders showed nothing while fetching.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      // Same-page navigations (incl. searchParams-only like ?tab=) DO trigger
      // a server render — start the bar for any URL that differs, even a tab.
      const current = location.pathname + location.search;
      const next = url.pathname + url.search;
      if (current === next) return;
      startProgress();
    }
    document.addEventListener("click", handleClick);
    const onPop = () => startProgress();
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", handleClick);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // Detect form submissions (server actions + GET search forms)
  useEffect(() => {
    function handleSubmit(e: SubmitEvent) {
      const form = e.target as HTMLFormElement;
      if (form) {
        startProgress();
        // Fallback: auto-hide after 8s in case page doesn't navigate
        if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
        fallbackTimer.current = setTimeout(() => {
          finishProgress();
          setShowOverlay(false);
        }, 8000);
      }
    }
    document.addEventListener("submit", handleSubmit);
    return () => {
      document.removeEventListener("submit", handleSubmit);
      if (completeTimer.current) clearTimeout(completeTimer.current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    };
  }, []);

  if (!loading && progress === 0 && !showOverlay) return null;

  return (
    <>
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

      {/* Center-screen branded loader for navigations that outlive ~150ms —
          the moment a route swap lands, this unmounts with the tree. */}
      {showOverlay ? (
        <div className="pointer-events-none fixed inset-0 z-[9998] flex items-center justify-center bg-white/60 backdrop-blur-sm dark:bg-[#0a0a0e]/60">
          <BrandedLoader size="lg" label="Loading page" />
        </div>
      ) : null}
    </>
  );
}
