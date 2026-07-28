/** Format GBP as £1,234 or compact £12.4k */
export function formatGbp(
  value: number,
  opts?: { compact?: boolean; signed?: boolean },
): string {
  if (!Number.isFinite(value)) return "–";
  const abs = Math.abs(value);
  const sign = opts?.signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : value < 0 ? "−" : "";
  const mag = opts?.signed ? abs : abs;
  if (opts?.compact && abs >= 1000) {
    const k = abs / 1000;
    const s = k >= 100 ? k.toFixed(0) : k.toFixed(1);
    return `${sign}£${s}k`;
  }
  return `${sign}£${mag.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

/** Percentage with 1 d.p.; deltas get explicit sign */
export function formatPct(
  value: number | null | undefined,
  opts?: { signed?: boolean },
): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const pct = value * 100;
  const signed = opts?.signed ?? false;
  const sign = signed ? (pct > 0 ? "+" : pct < 0 ? "−" : "") : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/** XIRR display: en-dash when suppressed */
export function formatXirr(
  xirr: number | null | undefined,
  suppressAnnualised: boolean,
): string {
  if (suppressAnnualised || xirr == null || !Number.isFinite(xirr)) return "–";
  return formatPct(xirr, { signed: true });
}

/** Ratio around 1.0, e.g. 0.98× — never a percentage; a ratio in % reads as a return. */
export function formatRatio(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return `${v.toFixed(2)}×`;
}

export function formatShares(n: number): string {
  if (!Number.isFinite(n)) return "–";
  if (Math.abs(n) >= 100) return n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-GB", { maximumFractionDigits: 4 });
}

export function formatDate(iso: string): string {
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[m - 1]} ${y}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "never";
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}d ago`;
  return formatDate(iso);
}
