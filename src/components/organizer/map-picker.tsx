"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { MapPin, Search } from "lucide-react";

// Fix default marker icon for Leaflet in webpack
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Kolkata center
const DEFAULT_CENTER: [number, number] = [22.5726, 88.3639];
const DEFAULT_ZOOM = 12;

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function DragMarker({
  position,
  onDragEnd,
}: {
  position: [number, number];
  onDragEnd: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  return (
    <Marker
      ref={markerRef}
      position={position}
      draggable
      eventHandlers={{
        dragend() {
          const marker = markerRef.current;
          if (marker) {
            const ll = marker.getLatLng();
            onDragEnd(ll.lat, ll.lng);
          }
        },
      }}
    />
  );
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom() < 13 ? 14 : map.getZoom());
  }, [map, center]);
  return null;
}

export function MapPicker({
  initialLat,
  initialLng,
  onLocationChange,
}: {
  initialLat?: string;
  initialLng?: string;
  onLocationChange: (lat: number, lng: number) => void;
}) {
  const hasInitial =
    initialLat && initialLng && !isNaN(Number(initialLat)) && !isNaN(Number(initialLng));
  const [position, setPosition] = useState<[number, number]>(
    hasInitial ? [Number(initialLat), Number(initialLng)] : DEFAULT_CENTER,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  function updateLocation(lat: number, lng: number) {
    setPosition([lat, lng]);
    onLocationChange(lat, lng);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setShowResults(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery,
        )}&limit=5&countrycodes=in`,
        { headers: { Accept: "application/json" } },
      );
      const data = (await res.json()) as SearchResult[];
      setSearchResults(data);
      if (data.length > 0) {
        const lat = Number(data[0].lat);
        const lng = Number(data[0].lon);
        updateLocation(lat, lng);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function pickResult(result: SearchResult) {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    updateLocation(lat, lng);
    setShowResults(false);
    setSearchQuery(result.display_name.split(",")[0]);
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSearch(e as unknown as React.FormEvent); } }}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              placeholder="Search for a venue, area, or landmark…"
              className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSearch({ preventDefault: () => {} } as unknown as React.FormEvent)}
            disabled={searching}
            className="shrink-0 rounded-2xl bg-violet-neon px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {searching ? "…" : "Search"}
          </button>
        </div>

        {/* Search results dropdown */}
        {showResults && searchResults.length > 0 ? (
          <div className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900">
            {searchResults.map((result, index) => (
              <button
                key={index}
                type="button"
                onClick={() => pickResult(result)}
                className="flex w-full items-start gap-2 px-4 py-2.5 text-left text-xs hover:bg-zinc-50 dark:hover:bg-white/5"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-neon" />
                <span className="text-zinc-700 dark:text-zinc-300">
                  {result.display_name}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Map */}
      <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
        {!mapReady ? (
          <div className="flex h-full items-center justify-center bg-zinc-100 dark:bg-white/5">
            <p className="text-xs text-muted">Loading map…</p>
          </div>
        ) : null}
        <MapContainer
          center={position}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          className="h-full w-full"
          whenReady={() => setMapReady(true)}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onClick={updateLocation} />
          <DragMarker position={position} onDragEnd={updateLocation} />
          <Recenter center={position} />
        </MapContainer>
      </div>

      {/* Coordinates display */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <MapPin className="h-3.5 w-3.5 text-violet-neon" />
        <span>
          {position[0].toFixed(6)}, {position[1].toFixed(6)}
        </span>
        <span className="text-zinc-400">· click map or drag marker to adjust</span>
      </div>

      {/* Hidden inputs for form submission */}
      <input type="hidden" name="latitude" value={position[0]} />
      <input type="hidden" name="longitude" value={position[1]} />
    </div>
  );
}
