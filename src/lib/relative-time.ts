/** A Z or an offset at the end of an ISO 8601 time. */
const ZONE_DESIGNATOR = /(?:Z|[+-]\d{2}:?\d{2})$/i;
/** A time of day: only a date with one can lack a zone, since a bare date already reads as UTC. */
const TIME_OF_DAY = /T\d{2}:\d{2}/;

/**
 * An API timestamp as a Date. The API answers in UTC with a Z; a time without any zone (an older
 * answer) is UTC too, never the browser's own time. A Z or an offset is read as it is, so no time
 * is shifted twice.
 */
export function parseApiTime(iso: string): Date {
  return new Date(TIME_OF_DAY.test(iso) && !ZONE_DESIGNATOR.test(iso) ? `${iso}Z` : iso);
}

/** "3 minutes ago", "in 2 days", "just now" for an API timestamp; empty for one that can't be read. */
export function formatRelativeTime(iso: string): string {
  const d = parseApiTime(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  const absSec = Math.abs(diffMs) / 1000;
  for (const [unit, secs] of units) {
    if (absSec >= secs) {
      return rtf.format(Math.round(diffMs / 1000 / secs), unit);
    }
  }
  return "just now";
}
