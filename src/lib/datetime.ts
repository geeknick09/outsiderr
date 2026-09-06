/**
 * IST (Asia/Kolkata, UTC+05:30) datetime helpers.
 *
 * datetime-local inputs produce naive strings like "2026-09-10T19:00" with
 * no timezone offset. By default, `new Date(naive)` treats them as UTC on
 * servers and as browser-local on clients — neither is correct for an app
 * that always operates in IST.
 *
 * These helpers ensure naive datetime-local strings are always interpreted
 * as Asia/Kolkata before being stored as UTC ISO strings, and that UTC ISO
 * strings are always rendered as Asia/Kolkata for datetime-local inputs.
 */

/**
 * Convert a naive datetime-local string (YYYY-MM-DDTHH:mm) to a UTC ISO string,
 * treating the input as Asia/Kolkata time.
 *
 * If the string already has a timezone offset or is "Z" UTC, it is passed through.
 */
export function istToUTC(naive: string): string {
  if (!naive) return "";
  // If already has an offset (Z, +05:30, -08:00, etc.), use as-is
  const hasOffset = /([Z]|[+-]\d{2}:?\d{2})$/.test(naive);
  const withOffset = hasOffset ? naive : `${naive}+05:30`;
  const d = new Date(withOffset);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${naive}`);
  }
  return d.toISOString();
}

/**
 * Convert a UTC ISO string to a datetime-local input value (YYYY-MM-DDTHH:mm)
 * in Asia/Kolkata timezone.
 */
export function utcToISTInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // Use Intl.DateTimeFormat to get IST components
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  if (!parts.year) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Get the current time as a datetime-local input value (YYYY-MM-DDTHH:mm)
 * in Asia/Kolkata timezone. Useful for `min` attributes on datetime-local inputs.
 */
export function nowISTInput(): string {
  return utcToISTInput(new Date().toISOString());
}
