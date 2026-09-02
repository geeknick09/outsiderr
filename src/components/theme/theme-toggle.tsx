"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { saveThemePreferenceAction } from "@/actions/auth";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Only read resolvedTheme after mount to avoid server/client mismatch
  const isDark = mounted ? resolvedTheme !== "light" : true;

  function toggle() {
    const next = isDark ? "light" : "dark";
    setTheme(next);
    // Best-effort sync with profiles.theme_preference; ignored in demo mode.
    void saveThemePreferenceAction(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      suppressHydrationWarning
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Toggle theme"}
      title={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Toggle theme"}
      className="glass flex h-10 w-10 items-center justify-center rounded-full transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.35)]"
    >
      {mounted && !isDark ? (
        <Moon className="h-[18px] w-[18px] text-violet-600" />
      ) : (
        <Sun className="h-[18px] w-[18px] text-lime-neon" />
      )}
    </button>
  );
}
