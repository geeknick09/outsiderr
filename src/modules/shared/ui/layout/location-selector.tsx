"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LocateFixed, MapPin } from "lucide-react";

import { Button } from "../ui/button";
import { CITIES, DEFAULT_CITY } from "../../lib/constants";
import { cityLabel, normalizeCityKey, nearestIndianCity } from "../../lib/india-cities";
import type { City } from "../../lib/types";
import { cn } from "../../lib/utils";

const STORAGE_KEY = "outsiderr-city";

function nearestCity(latitude: number, longitude: number): City {
  return nearestIndianCity(latitude, longitude)?.value ?? DEFAULT_CITY;
}

export function LocationSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [filter, setFilter] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const paramCity = searchParams.get("city") as City | null;
  const city = paramCity ? normalizeCityKey(paramCity) : DEFAULT_CITY;

  const filteredCities = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return CITIES;
    return CITIES.filter((c) => c.label.toLowerCase().includes(q));
  }, [filter]);

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

  // Restore the last manual choice when on the homepage and the URL
  // does not pin a city yet. We only do this on "/" so that navigating
  // to event detail pages (which don't have a city param) doesn't
  // redirect the user back to the homepage.
  useEffect(() => {
    if (paramCity) return;
    if (pathname !== "/") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as City | null;
    if (stored && stored !== DEFAULT_CITY && cityLabel(stored)) applyCity(stored);
  }, [applyCity, paramCity, pathname]);

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
        <span className="hidden sm:inline">{cityLabel(city)}</span>
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

          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filter.trim()) {
                applyCity(normalizeCityKey(filter));
                setFilter("");
              }
            }}
            placeholder="Search or type your city…"
            className="mb-3 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
          />

          <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto">
            {filteredCities.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === city}
                title={option.label}
                onClick={() => applyCity(option.value)}
                className={cn(
                  "w-full truncate rounded-2xl border p-3 text-left text-sm font-semibold transition-all",
                  option.value === city
                    ? "border-violet-neon bg-violet-neon/10 text-violet-600 dark:text-violet-300"
                    : "border-zinc-200 hover:border-violet-neon/60 dark:border-white/10",
                )}
              >
                {option.label}
              </button>
            ))}
            {filteredCities.length === 0 && filter.trim() ? (
              <button
                type="button"
                onClick={() => {
                  applyCity(normalizeCityKey(filter));
                  setFilter("");
                }}
                className="col-span-2 truncate rounded-2xl border border-dashed border-violet-neon/60 p-3 text-left text-sm font-semibold text-violet-600 dark:text-violet-300"
              >
                Use &ldquo;{filter.trim()}&rdquo;
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
