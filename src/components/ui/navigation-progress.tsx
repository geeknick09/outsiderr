"use client";

import { useEffect, useState } from "react";

/**
 * A thin top-of-page progress bar that appears during route transitions and
 * server action submissions.
 *
 * Uses a combination of:
 * - `usePathname` to detect route changes
 * - A MutationObserver on `<body>` to detect when server action forms are
 *   submitted (form `action` attributes fire a submit event)
 * - A simple timer-based animation for the progress bar fill
 */
export function NavigationProgress() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    let fadeTimer: ReturnType<typeof setTimeout>;

    function start() {
      setLoading(true);
      setProgress(0);
      clearInterval(timer);
      timer = setInterval(() => {
        setProgress((p) => {
          // Ease towards 90% — never reach 100% until we're done
          if (p >= 90) return p;
          return p + (90 - p) * 0.1;
        });
      }, 100);
    }

    function done() {
      clearInterval(timer);
      setProgress(100);
      fadeTimer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 300);
    }

    // Detect form submissions (server actions use <form> submissions)
    function handleSubmit(e: SubmitEvent) {
      // Only react to forms with action/formAction (server action forms)
      const form = e.target as HTMLFormElement;
      if (form && form.method === "post") {
        start();
        // The server action will cause a revalidation / navigation
        // We'll detect completion via the DOM changes
        setTimeout(done, 5000); // Fallback: hide after 5s
      }
    }

    document.addEventListener("submit", handleSubmit);

    // Detect route changes via popstate
    function handlePopState() {
      start();
      done();
    }
    window.addEventListener("popstate", handlePopState);

    // Detect clicks on internal links
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
      // Only show for internal navigations that change the path
      try {
        const url = new URL(href, window.location.href);
        if (url.pathname !== window.location.pathname) {
          start();
          // Hide after a short delay — the new page will render
          setTimeout(done, 800);
        }
      } catch {
        // ignore
      }
    }
    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("submit", handleSubmit);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleClick);
      clearInterval(timer);
      clearTimeout(fadeTimer);
    };
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] h-0.5 pointer-events-none">
      <div
        className="h-full bg-neon-gradient transition-[width] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          transition: progress >= 100 ? "width 0.2s ease-out, opacity 0.3s ease-out" : "width 0.2s ease-out",
        }}
      />
    </div>
  );
}
