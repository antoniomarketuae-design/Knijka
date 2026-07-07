/**
 * Calendar-day helpers pinned to Europe/Sofia — the product's single market.
 *
 * Streaks and daily missions roll over at SOFIA midnight regardless of the
 * server's timezone. All conversions go through Intl so DST is handled
 * correctly (Sofia days can be 23–25 hours long); day arithmetic uses a
 * monotonic day INDEX rather than dividing timestamps by 24h, which would
 * mis-count across DST transitions.
 */

export const SOFIA_TZ = "Europe/Sofia";

// en-CA formats dates as exactly "YYYY-MM-DD".
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SOFIA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// h23 avoids the "24:00" edge case of h24.
const hourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: SOFIA_TZ,
  hour: "2-digit",
  hourCycle: "h23",
});

/** The Sofia calendar day of an instant, as "YYYY-MM-DD". */
export function sofiaDayString(d: Date): string {
  return dayFmt.format(d);
}

/**
 * Monotonic index of the Sofia calendar day (days since Unix epoch).
 * `sofiaDayIndex(a) - sofiaDayIndex(b)` is the exact number of Sofia
 * calendar days between two instants, DST-safe.
 */
export function sofiaDayIndex(d: Date): number {
  const parts = sofiaDayString(d).split("-").map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86_400_000;
}

/** Hour of day (0..23) in Sofia. */
export function sofiaHour(d: Date): number {
  return Number(hourFmt.format(d));
}
