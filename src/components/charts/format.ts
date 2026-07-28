import { formatGbp, formatPct } from "@/lib/format/numbers";

export const TABULAR_CLASS = "tabular";

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
};

/** Prices in the instrument's trading currency: `$142`, `£4.20`, `312 SEK`. */
export function makeAxisPriceFormatter(currency: string): (n: number) => string {
  const code = currency.toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code];
  return (n) => {
    if (!Number.isFinite(n)) return "–";
    const abs = Math.abs(n);
    // Penny stocks need the pennies; anything larger reads better rounded.
    const body = abs > 0 && abs < 10 ? abs.toFixed(2) : formatAxisNumber(abs);
    const sign = n < 0 ? "−" : "";
    return symbol ? `${sign}${symbol}${body}` : `${sign}${body} ${code}`;
  };
}

export function formatAxisGbp(n: number): string {
  return formatGbp(n, { compact: Math.abs(n) >= 1000 });
}

export function formatAxisPct(n: number): string {
  return formatPct(n);
}

export function formatTooltipGbp(n: number, signed = false): string {
  return formatGbp(n, { signed });
}

export function formatTooltipPct(n: number, signed = false): string {
  return formatPct(n, { signed });
}
