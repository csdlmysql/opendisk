// Number formatting utilities — shared across the app.

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/**
 * Format bytes macOS/DaisyDisk style (base 1000, decimal).
 * e.g. 1330000000 -> "1.33 GB"
 */
export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes <= 0) return "0 B";
  let i = 0;
  let n = bytes;
  while (n >= 1000 && i < UNITS.length - 1) {
    n /= 1000;
    i++;
  }
  const decimals = n >= 100 || i === 0 ? 0 : n >= 10 ? 1 : 2;
  return `${n.toFixed(decimals)} ${UNITS[i]}`;
}

/** Format an integer with thousands separators: 12345 -> "12,345" */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Truncate the middle of a name: "verylongfilename.mp4" -> "verylo…name.mp4" */
export function truncateMiddle(text: string, max = 34): string {
  if (text.length <= max) return text;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

/**
 * Truncate a path: keep the start and end, drop the middle.
 * "/Users/me/a/b/c/d/file" -> "/Users/…/d/file"
 */
export function truncatePath(path: string, maxSegments = 4): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= maxSegments) return path;
  const head = parts.slice(0, 1);
  const tail = parts.slice(parts.length - (maxSegments - 1));
  const prefix = path.startsWith("/") ? "/" : "";
  return `${prefix}${head.join("/")}/…/${tail.join("/")}`;
}

/** Percentage of part relative to total, rounded to 1 decimal. */
export function formatPercent(part: number, total: number): string {
  if (total <= 0) return "0%";
  const p = (part / total) * 100;
  return p >= 10 ? `${p.toFixed(0)}%` : `${p.toFixed(1)}%`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Short month/year label from epoch ms: 1710000000000 -> "Mar 2024" */
export function formatDate(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "—";
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Full date-time label from epoch ms: "Mar 9, 2024 14:03" */
export function formatDateTime(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "—";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${hh}:${mm}`;
}

/** Signed byte delta: 1300000000 -> "+1.3 GB", -524288000 -> "-500 MB", 0 -> "0 B" */
export function formatDelta(bytes: number): string {
  if (bytes === 0) return "0 B";
  const sign = bytes > 0 ? "+" : "-";
  return `${sign}${formatBytes(Math.abs(bytes))}`;
}
