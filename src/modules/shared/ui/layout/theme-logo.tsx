"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeLogo({ width = 140, height = 32 }: { width?: number; height?: number }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Before hydration, render a placeholder to avoid mismatch
  if (!mounted) {
    return <div style={{ width, height }} className="shrink-0" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Image
      src={isDark ? "/darkmode.png" : "/lightmode.png"}
      alt="Outsiderr"
      width={width}
      height={height}
      priority
      className="h-auto w-auto shrink-0 max-w-[120px] sm:max-w-none"
    />
  );
}
