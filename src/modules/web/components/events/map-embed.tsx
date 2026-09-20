import { MapPin } from "lucide-react";

export function MapEmbed({
  latitude,
  longitude,
  venueName,
  googleMapsLink,
}: {
  latitude: number | null;
  longitude: number | null;
  venueName: string;
  googleMapsLink?: string | null;
}) {
  if (!latitude || !longitude) return null;

  const delta = 0.008;
  const bbox = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta,
  ].join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;

  // Use organizer-provided Google Maps link if available, otherwise generate one from coords
  const gmapsLink =
    googleMapsLink && googleMapsLink.trim().length > 0
      ? googleMapsLink.trim()
      : `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
      <a href={gmapsLink} target="_blank" rel="noreferrer" className="block">
        <iframe
          title={`Map showing ${venueName}`}
          src={src}
          width="100%"
          height="220"
          className="block border-0 pointer-events-none"
          loading="lazy"
        />
      </a>
      <a
        href={gmapsLink}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1.5 bg-zinc-50 py-2 text-xs font-semibold text-violet-neon hover:bg-zinc-100 dark:bg-white/5 dark:hover:bg-white/10"
      >
        <MapPin className="h-3.5 w-3.5" />
        Open in Google Maps ↗
      </a>
    </div>
  );
}
