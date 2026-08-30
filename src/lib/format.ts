/** Everything is rendered in IST so server and client output always agree. */
const TZ = "Asia/Kolkata";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const INR_WITH_PAISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

export function formatPaise(paise: number): string {
  return paise % 100 === 0 ? INR.format(paise / 100) : INR_WITH_PAISE.format(paise / 100);
}

/** "Free" or "From ₹499" — used on discovery cards. */
export function formatPriceTag(minPricePaise: number): string {
  return minPricePaise <= 0 ? "Free" : `From ${formatPaise(minPricePaise)}`;
}

export function formatDateBadge(iso: string): { day: string; month: string } {
  const date = new Date(iso);
  return {
    day: date.toLocaleDateString("en-IN", { day: "2-digit", timeZone: TZ }),
    month: date
      .toLocaleDateString("en-IN", { month: "short", timeZone: TZ })
      .toUpperCase(),
  };
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function formatDateRange(startIso: string, endIso: string | null): string {
  const start = formatDateTime(startIso);
  if (!endIso) return start;
  const end = new Date(endIso);
  const sameDay = istDay(startIso) === istDay(endIso);
  return `${start} – ${end.toLocaleString("en-IN", {
    ...(sameDay ? {} : { day: "numeric", month: "short" }),
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  })}`;
}

function istDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

export function isToday(iso: string): boolean {
  return istDay(iso) === istDay(new Date().toISOString());
}

export function mapsLink(
  latitude: number | null,
  longitude: number | null,
  fallbackQuery: string,
): string {
  const query =
    latitude !== null && longitude !== null
      ? `${latitude},${longitude}`
      : fallbackQuery;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
