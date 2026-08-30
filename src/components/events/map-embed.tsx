export function MapEmbed({
  latitude,
  longitude,
  venueName,
}: {
  latitude: number | null;
  longitude: number | null;
  venueName: string;
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
  const link = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
      <iframe
        title={`Map showing ${venueName}`}
        src={src}
        width="100%"
        height="220"
        className="block border-0"
        loading="lazy"
      />
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1 bg-zinc-50 py-2 text-xs text-muted hover:text-violet-neon dark:bg-white/5"
      >
        View on OpenStreetMap ↗
      </a>
    </div>
  );
}
