import {
  parseISO,
  differenceInDays,
  formatDistanceToNow,
  format,
} from "date-fns";
import { zhTW } from "date-fns/locale";

/**
 * Format number according to spec section 1.2:
 * - < 1000: display as-is (e.g. "892")
 * - 1000-9999: "X.XK" (e.g. "3.2K")
 * - 10000-99999999: "XX.X萬" (e.g. "12.5萬")
 * - >= 100000000: "X.X億" (e.g. "1.3億")
 * Strip trailing .0 (e.g. "3.0K" → "3K")
 */
export function formatNumber(n: number): string {
  if (n < 1000) {
    return n.toString();
  }
  if (n < 10000) {
    const formatted = (n / 1000).toFixed(1);
    // Strip trailing .0
    return formatted.endsWith(".0") ? formatted.slice(0, -2) + "K" : formatted + "K";
  }
  if (n < 100000000) {
    const formatted = (n / 10000).toFixed(1);
    return formatted.endsWith(".0") ? formatted.slice(0, -2) + "萬" : formatted + "萬";
  }
  // >= 100000000
  const formatted = (n / 100000000).toFixed(1);
  return formatted.endsWith(".0") ? formatted.slice(0, -2) + "億" : formatted + "億";
}

/**
 * Format change with text, color, and arrow indicator
 * Positive: { text: "+1.2K", color: 'green', arrow: '↑' }
 * Negative: { text: "-500", color: 'red', arrow: '↓' }
 * Zero: { text: "0", color: 'gray', arrow: '' }
 */
export function formatChange(
  current: number,
  previous: number
): { text: string; color: "green" | "red" | "gray"; arrow: "↑" | "↓" | "" } {
  const change = current - previous;

  if (change === 0) {
    return { text: "0", color: "gray", arrow: "" };
  }

  const sign = change > 0 ? "+" : "-";
  const text = sign + formatNumber(Math.abs(change));

  if (change > 0) {
    return { text, color: "green", arrow: "↑" };
  }
  // change < 0
  return { text, color: "red", arrow: "↓" };
}

/**
 * Format percentage change as "+12.3%" or "-5.1%" or "0.0%"
 * Always show sign for non-zero, one decimal place
 */
export function formatPercentChange(current: number, previous: number): string {
  if (previous === 0) {
    return "0.0%";
  }

  const percentChange = ((current - previous) / previous) * 100;

  if (percentChange === 0) {
    return "0.0%";
  }

  const sign = percentChange > 0 ? "+" : "";
  return sign + percentChange.toFixed(1) + "%";
}

/**
 * Format relative time for dates
 * If diff <= 30 days: use formatDistanceToNow with Chinese locale (e.g. "3 小時前")
 * If diff > 30 days: use "YYYY-MM-DD" format
 * Handle empty/null by returning "—"
 */
export function formatRelativeTime(dateStr: string): string {
  if (!dateStr || dateStr.trim() === "") {
    return "—";
  }

  try {
    const parsedDate = parseISO(dateStr);
    const daysDiff = differenceInDays(new Date(), parsedDate);

    if (daysDiff <= 30) {
      return formatDistanceToNow(parsedDate, { addSuffix: true, locale: zhTW });
    }

    // > 30 days: show full date
    return format(parsedDate, "yyyy-MM-dd");
  } catch {
    return "—";
  }
}

/**
 * Format date as "YYYY-MM-DD"
 * Handle empty/null by returning "—"
 */
export function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === "") {
    return "—";
  }

  try {
    const parsedDate = parseISO(dateStr);
    return format(parsedDate, "yyyy-MM-dd");
  } catch {
    return "—";
  }
}

/**
 * Format date as "YYYY-MM-DD HH:mm:ss"
 * Handle empty/null by returning "—"
 */
export function formatDateTime(dateStr: string): string {
  if (!dateStr || dateStr.trim() === "") {
    return "—";
  }

  try {
    const parsedDate = parseISO(dateStr);
    return format(parsedDate, "yyyy-MM-dd HH:mm:ss");
  } catch {
    return "—";
  }
}

/**
 * Parse ISO 8601 duration (e.g. "PT1H23M45S", "PT5M30S", "PT45S")
 * Output: "HH:MM:SS" format with hours if present, "MM:SS" if < 1 hour
 * Pad minutes/seconds to 2 digits
 * Handle empty/null by returning "—"
 */
export function formatDuration(isoDuration: string): string {
  if (!isoDuration || isoDuration.trim() === "") {
    return "—";
  }

  try {
    // ISO 8601 duration regex: PT[nH][nM][nS]
    const durationRegex = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;
    const match = isoDuration.match(durationRegex);

    if (!match) {
      return "—";
    }

    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  } catch {
    return "—";
  }
}
