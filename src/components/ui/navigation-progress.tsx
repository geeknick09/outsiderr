"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin top-of-page progress bar that appears during route transitions.
 *
 * Uses `usePathname` and `useSearchParams` from next/navigation to detect
 * when navigation starts. The bar fills gradually and completes when the
 * new page has rendered.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPath = useRef(pathname + searchParams.toString());

  useEffect(() => {
    const currentPath = pathname + searchParams.toString();

    // Only trigger if the path actually changed
    if (currentPath === prevPath.current) return;
    prevPath.current = currentPath;

    // Start progress
    setLoading(true);
    setProgress(0);

    if (timerRef.current) clearInterval(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

    timerRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        return p + (90 - p) * 0.1;
      });
    }, 100);

    // Complete after a short delay (the new page has rendered)
    const completeTimer = setTimeout(() => {
      if (timerRef.current) clearInterval(timerRef.current);
      setProgress(100);
      fadeTimerRef.current = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 300);
    }, 600);

    return () => clearTimeout(completeTimer);
  }, [pathname, searchParams]);

  // Also detect form submissions (server actions)
  useEffect(() => {
    function handleSubmit(e: SubmitEvent) {
      const form = e.target as HTMLFormElement;
      if (form && form.method === "post") {
        setLoading(true);
        setProgress(0);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setProgress((p) => {
            if (p >= 90) return p;
            return p + (90 - p) * 0.1;
          });
        }, 100);
        // Fallback: hide after 8s
        setTimeout(() => {
          if (timerRef.current) clearInterval(timerRef.current);
          setProgress(100);
          setTimeout(() => {
            setLoading(false);
            setProgress(0);
          }, 300);
        }, 8000);
      }
    }
    document.addEventListener("submit", handleSubmit);
    return () => {
      document.removeEventListener("submit", handleSubmit);
      if (timerRef.current) clearInterval(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] h-1 pointer-events-none">
      <div
        className="h-full bg-neon-gradient transition-[width] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          transition:
            progress >= 100
              ? "width 0.2s ease-out, opacity 0.3s ease-out"
              : "width 0.2s ease-out",
        }}
      />
    </div>
  );
}
