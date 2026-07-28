import { formatGbp, formatPct } from "@/lib/format/numbers";

export const TABULAR_CLASS = "tabular";

export function formatAxisDate(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatAxisDateShort(d: Date): string {
  return `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`;
}

export function formatAxisNumber(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

export function formatAxisGbp(n: number): string {
  return formatGbp(n, { compact: Math.abs(n) >= 1000 });
}

export function formatAxisPct(n: number): string {
  return formatPct(n);
}

export function formatTooltipGbp(n: number): string {
  return formatGbp(n);
}

export function formatTooltipPct(n: number, signed = false): string {
  return formatPct(n, { signed });
}
