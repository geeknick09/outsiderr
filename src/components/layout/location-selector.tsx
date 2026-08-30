"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocateFixed, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
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

  const paramCity = searchParams.get("city") as City | null;
  const city = paramCity && CITY_LABELS[paramCity] ? paramCity : DEFAULT_CITY;

  const applyCity = useCallback(
    (next: City) => {
      window.localStorage.setItem(STORAGE_KEY, next);
      const params = new URLSearchParams(searchParams.toString());
      params.set("city", next);
      // Changing city always lands the user back on discovery for that city.
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.35)]"
      >
        <MapPin className="h-4 w-4 text-violet-neon" />
        <span className="hidden sm:inline">{CITY_LABELS[city]}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Choose your city">
        <div className="space-y-4">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={detect}
            disabled={detecting}
          >
            <LocateFixed className="h-4 w-4" />
            {detecting ? "Detecting…" : "Use my current location"}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            {CITIES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => applyCity(option.value)}
                className={cn(
                  "rounded-2xl border p-4 text-left text-sm font-semibold transition-all",
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
      </Modal>
    </>
  );
}
