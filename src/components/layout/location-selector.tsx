"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocateFixed, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CITIES, CITY_LABELS, DEFAULT_CITY } from "@/lib/constants";
import type { City } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "outsiderr-city";

function nearestCity(latitude: number, longitude: number): City {
  return CITIES.reduce((closest, city) => {
    const distance = (city.lat - latitude) ** 2 + (city.lng - longitude) ** 2;
    const closestDistance =
      (closest.lat - latitude) ** 2 + (closest.lng - longitude) ** 2;
    return distance < closestDistance ? city : closest;
  }, CITIES[0]).value;
}

export function LocationSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const paramCity = searchParams.get("city") as City | null;
  const city = paramCity && CITY_LABELS[paramCity] ? paramCity : DEFAULT_CITY;

  const applyCity = useCallback(
    (next: City) => {
      window.localStorage.setItem(STORAGE_KEY, next);
      const params = new URLSearchParams(searchParams.toString());
      params.set("city", next);
      router.push(`/?${params.toString()}`);
      setOpen(false);
    },
    [router, searchParams],
  );

  // Restore the last manual choice when the URL does not pin a city yet.
  useEffect(() => {
    if (paramCity) return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as City | null;
    if (stored && stored !== DEFAULT_CITY && CITY_LABELS[stored]) applyCity(stored);
  }, [applyCity, paramCity]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function detect() {
    if (!navigator.geolocation) {
      setOpen(true);
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDetecting(false);
        applyCity(nearestCity(position.coords.latitude, position.coords.longitude));
      },
      () => {
        setDetecting(false);
        setOpen(true);
      },
      { timeout: 8000 },
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="glass flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.35)]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <MapPin className="h-4 w-4 text-violet-neon" />
        <span className="hidden sm:inline">{CITY_LABELS[city]}</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-3xl border border-zinc-200 bg-zinc-50/95 p-4 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Choose your city
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mb-3 w-full"
            onClick={detect}
            disabled={detecting}
          >
            <LocateFixed className="h-4 w-4" />
            {detecting ? "Detecting…" : "Use my location"}
          </Button>

          <div className="grid grid-cols-2 gap-2">
            {CITIES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === city}
                onClick={() => applyCity(option.value)}
                className={cn(
                  "rounded-2xl border p-3 text-left text-sm font-semibold transition-all",
                  option.value === city
                    ? "border-violet-neon bg-violet-neon/10 text-violet-600 dark:text-violet-300"
                    : "border-zinc-200 hover:border-violet-neon/60 dark:border-white/10",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
