import type { DatePoint } from "./types";
import type { ColumnDatum } from "./ColumnSeries";
import type { DivergingBarDatum } from "./DivergingBars";
import type { ScatterPoint } from "./ScatterPlot";
import type { StripPoint } from "./StripPlot";
import type { StackedSeries } from "./StackedArea";
import type { TradeMarker } from "./TradeMarkers";
import type { DecompositionSegment } from "./DecompositionBar";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function dateSeries(days: number, fn: (i: number) => number): DatePoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: daysAgo(days - i),
    value: fn(i),
  }));
}

export const FIXTURE_WIDTH = 640;

export const lineSeriesA: DatePoint[] = dateSeries(120, (i) => 10000 + Math.sin(i / 12) * 1500 + i * 20);
export const lineSeriesB: DatePoint[] = dateSeries(120, (i) => 8000 + Math.cos(i / 10) * 1000 + i * 15);

export const stepShares: DatePoint[] = [
  { date: daysAgo(120), value: 0 },
  { date: daysAgo(100), value: 50 },
  { date: daysAgo(80), value: 50 },
  { date: daysAgo(60), value: 75 },
  { date: daysAgo(40), value: 75 },
  { date: daysAgo(20), value: 30 },
  { date: daysAgo(0), value: 30 },
];

export const monthlyFlows: ColumnDatum[] = Array.from({ length: 12 }, (_, i) => ({
  date: new Date(2025, i, 1),
  value: (i % 3 === 0 ? -1 : 1) * (500 + i * 120),
}));

export const stackedSeries: StackedSeries[] = [
  {
    id: "aapl",
    name: "AAPL",
    slot: 1,
    data: dateSeries(60, (i) => 0.2 + Math.sin(i / 8) * 0.05),
  },
  {
    id: "msft",
    name: "MSFT",
    slot: 2,
    data: dateSeries(60, (i) => 0.18 + Math.cos(i / 7) * 0.04),
  },
  {
    id: "nvda",
    name: "NVDA",
    slot: 3,
    data: dateSeries(60, (i) => 0.15 + i * 0.002),
  },
  {
    id: "other1",
    name: "GOOG",
    slot: 4,
    data: dateSeries(60, () => 0.1),
  },
];

export const scatterPoints: ScatterPoint[] = [
  { id: "1", name: "AAPL", x: 2.1, y: 0.18, size: 12000, open: true },
  { id: "2", name: "MSFT", x: 3.5, y: 0.12, size: 8000, open: false },
  { id: "3", name: "NVDA", x: 1.2, y: 0.42, size: 15000, open: false },
  { id: "4", name: "TSLA", x: 0.8, y: -0.15, size: 5000, open: false },
  { id: "5", name: "AMZN", x: 4.2, y: 0.08, size: 10000, open: true },
];

export const divergingBars: DivergingBarDatum[] = [
  { id: "1", name: "NVDA", value: 4200 },
  { id: "2", name: "AAPL", value: 1800 },
  { id: "3", name: "TSLA", value: -900 },
  { id: "4", name: "META", value: -2100 },
  { id: "5", name: "MSFT", value: 650 },
];

export const stripPoints: StripPoint[] = [
  { id: "1", name: "AAPL", value: -4.2, detail: "Sold Jan 2024" },
  { id: "2", name: "TSLA", value: 8.5, detail: "Sold Mar 2024" },
  { id: "3", name: "NVDA", value: -12.1, detail: "Sold Jun 2024" },
  { id: "4", name: "META", value: 3.2, detail: "Sold Sep 2024" },
  { id: "5", name: "AMZN", value: -1.5, detail: "Sold Nov 2024" },
];

export const tradeMarkers: TradeMarker[] = [
  {
    id: "b1",
    date: daysAgo(100),
    price: 142,
    value: 2500,
    side: "buy",
    tooltip: {
      title: "Buy",
      rows: [
        { label: "Bought", value: "17.6 @ 142", color: "var(--polarity-pos)" },
        { label: "Cost incl. fees", value: "£2,500" },
      ],
    },
  },
  {
    id: "b2",
    date: daysAgo(70),
    price: 155,
    value: 1200,
    side: "buy",
    tooltip: {
      title: "Buy",
      rows: [
        { label: "Bought", value: "7.7 @ 155", color: "var(--polarity-pos)" },
        { label: "Cost incl. fees", value: "£1,200" },
      ],
    },
  },
  {
    id: "s1",
    date: daysAgo(30),
    price: 178,
    value: 3000,
    side: "sell",
    tooltip: {
      title: "Sell",
      rows: [
        { label: "Sold", value: "16.9 @ 178", color: "var(--polarity-neg)" },
        { label: "Proceeds net of fees", value: "£3,000" },
      ],
    },
  },
];

export const decompositionSegments: DecompositionSegment[] = [
  { id: "price", label: "Price", value: 3200, color: "var(--slot-1)" },
  { id: "dividends", label: "Dividends", value: 420, color: "var(--slot-3)" },
  { id: "fx", label: "FX", value: -180, color: "var(--slot-4)" },
];

export const allDates = lineSeriesA.map((d) => d.date);

export const chartTableRows = lineSeriesA.slice(-5).map((d, i) => ({
  date: d.date.toISOString().slice(0, 10),
  value: Math.round(d.value).toLocaleString(),
  invested: Math.round(lineSeriesB[i + lineSeriesB.length - 5]?.value ?? 0).toLocaleString(),
}));
