/**
 * Formatting utilities for Salmon Charter AI
 */

/**
 * Format an event code from a counter and optional date override
 * Output: "CATCH-2026-0404-001"
 */
export function formatEventCode(counter: number, date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const seq = String(counter).padStart(3, '0');
  return `CATCH-${year}-${month}${day}-${seq}`;
}

/**
 * Format ISO timestamp to human readable
 * Output: "Apr 4, 2026 · 14:32"
 */
export function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month} ${day}, ${year} · ${hours}:${minutes}`;
  } catch {
    return iso;
  }
}

/**
 * Format relative time
 * Output: "2 hours ago", "just now", "3 days ago"
 */
export function formatRelativeTime(iso: string): string {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffMs = now - then;

    if (diffMs < 0) return 'just now';

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;

    const years = Math.floor(months / 12);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  } catch {
    return 'unknown time';
  }
}

/**
 * Format GPS coordinates
 * Output: "44.8762° N, 80.2341° W"
 */
export function formatGPS(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

/**
 * Format speed in knots
 * Output: "5.2 kts"
 */
export function formatSpeed(knots: number): string {
  return `${Math.round(knots)} kts`;
}

/**
 * Format depth in feet with meter conversion
 * Output: "45 ft (13.7 m)"
 */
export function formatDepth(feet: number): string {
  return `${Math.round(feet)} ft`;
}

/**
 * Format wind direction as cardinal
 */
export function formatWindDirection(degrees: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return dirs[index];
}

/**
 * Format duration in seconds to mm:ss
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ─── Unit Conversions ───────────────────────────────────────────────────────

export function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

export function feetToMeters(feet: number): number {
  return feet * 0.3048;
}

export function knotsToKmh(knots: number): number {
  return knots * 1.852;
}

export function kmhToKnots(kmh: number): number {
  return kmh / 1.852;
}

export function knotsToMs(knots: number): number {
  return knots * 0.514444;
}

export function msToKnots(ms: number): number {
  return ms / 0.514444;
}

export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

export function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}
