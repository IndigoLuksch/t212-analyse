"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ChartCard,
  Legend,
  XAxisLinear,
  YAxis,
  createLinearScale,
  niceLinearDomain,
  useChartSize,
} from "@/components/charts";
import { formatAxisGbp, formatAxisPct } from "@/components/charts/Axes";
import { CHART_MARKS } from "@/components/charts/constants";
import { formatTooltipGbp, formatTooltipPct, snapPx } from "@/components/charts/format";
import { useTooltip } from "@/components/charts/TooltipLayer";

interface ReturnVsInvestedChartProps {
  positions: {
    ticker: string;
    name: string;
    isOpen: boolean;
    /** Every buy into the holding, so recycled capital counts each time. */
    invested: number;
    pnlGbp: number;
    totalReturn: number;
  }[];
}

type Mode = "pct" | "gbp";

const MARGINS = { top: 12, right: 16, bottom: 32, left: 56 };
const DOT_R = 6;

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]";

const stockHref = (ticker: string) => `/stocks/${encodeURIComponent(ticker)}`;

function ReturnVsInvestedPlot({
  positions,
  mode,
}: {
  positions: ReturnVsInvestedChartProps["positions"];
  mode: Mode;
}) {
  const { width, height } = useChartSize();
  const tooltip = useTooltip();
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const plotW = width - MARGINS.left - MARGINS.right;
  const plotH = height - MARGINS.top - MARGINS.bottom;

  const yOf = useCallback(
    (p: ReturnVsInvestedChartProps["positions"][number]) =>
      mode === "pct" ? p.totalReturn : p.pnlGbp,
    [mode],
  );

  const xScale = useMemo(
    () => createLinearScale(niceLinearDomain([0, ...positions.map((p) => p.invested)]), [0, plotW]),
    [positions, plotW],
  );
  const yScale = useMemo(
    () => createLinearScale(niceLinearDomain([0, ...positions.map(yOf)]), [plotH, 0]),
    [positions, yOf, plotH],
  );

  const nearest = useCallback(
    (mx: number, my: number) => {
      let best: (typeof positions)[number] | null = null;
      let bestDist = Infinity;
      for (const p of positions) {
        const d = Math.hypot(xScale(p.invested) - mx, yScale(yOf(p)) - my);
        if (d < Math.max(CHART_MARKS.hitTargetMin / 2, DOT_R) && d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
      return best;
    },
    [positions, xScale, yScale, yOf],
  );

  const plotPoint = (e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left - MARGINS.left, y: e.clientY - rect.top - MARGINS.top };
  };

  return (
    <svg ref={svgRef} width={width} height={height} className="select-none">
      <g transform={`translate(${MARGINS.left},${MARGINS.top})`}>
        <YAxis
          scale={yScale}
          height={plotH}
          format={mode === "pct" ? formatAxisPct : formatAxisGbp}
          width={plotW}
        />
        <line
          x1={0}
          x2={plotW}
          y1={snapPx(yScale(0))}
          y2={snapPx(yScale(0))}
          stroke="var(--baseline)"
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
        <g transform={`translate(0,${plotH})`}>
          <XAxisLinear scale={xScale} width={plotW} format={formatAxisGbp} />
        </g>
        {positions.map((p) => {
          const dimmed = hoverId !== null && hoverId !== p.ticker;
          return (
            <circle
              key={p.ticker}
              cx={xScale(p.invested)}
              cy={yScale(yOf(p))}
              r={DOT_R}
              fill={p.isOpen ? "var(--slot-1)" : "var(--muted)"}
              stroke="var(--surface)"
              strokeWidth={CHART_MARKS.markerRing}
              opacity={dimmed ? CHART_MARKS.fadedOpacity : 1}
              tabIndex={0}
              role="button"
              aria-label={`${p.name}: open stock`}
              className={`outline-none ${FOCUS}`}
              onFocus={() => setHoverId(p.ticker)}
              onBlur={() => setHoverId(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(stockHref(p.ticker));
                }
              }}
            />
          );
        })}
        <rect
          x={0}
          y={0}
          width={plotW}
          height={plotH}
          fill="transparent"
          style={{ cursor: hoverId !== null ? "pointer" : undefined }}
          onClick={(e) => {
            const pt = plotPoint(e);
            const p = nearest(pt.x, pt.y);
            if (p) router.push(stockHref(p.ticker));
          }}
          onMouseMove={(e) => {
            const pt = plotPoint(e);
            const p = nearest(pt.x, pt.y);
            setHoverId(p?.ticker ?? null);
            if (!p) {
              tooltip.hide();
              return;
            }
            const colour = p.pnlGbp >= 0 ? "var(--polarity-pos)" : "var(--polarity-neg)";
            tooltip.show(e.clientX, e.clientY, {
              title: p.name,
              rows: [
                { label: "Invested", value: formatTooltipGbp(p.invested) },
                { label: "Profit", value: formatTooltipGbp(p.pnlGbp, true), color: colour },
                {
                  label: "Return on capital deployed",
                  value: formatTooltipPct(p.totalReturn, true),
                  color: colour,
                },
              ],
              footer: p.isOpen ? "open position" : "closed",
            });
          }}
          onMouseLeave={() => {
            setHoverId(null);
            tooltip.hide();
          }}
        />
      </g>
    </svg>
  );
}

export function ReturnVsInvestedChart({ positions }: ReturnVsInvestedChartProps) {
  const [mode, setMode] = useState<Mode>("pct");

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-4">Stock</th>
          <th className="py-2 pr-4">Invested</th>
          <th className="py-2 pr-4">Profit</th>
          <th className="py-2 pr-4">Return</th>
          <th className="py-2">Status</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {[...positions]
          .sort((a, b) => b.invested - a.invested)
          .map((p) => (
            <tr key={p.ticker} className="border-b border-border hover:bg-page">
              <td className="py-2 pr-4">
                <Link href={stockHref(p.ticker)} className="text-ink hover:underline">
                  {p.name}
                </Link>
              </td>
              <td className="py-2 pr-4">{formatTooltipGbp(p.invested)}</td>
              <td className="py-2 pr-4">{formatTooltipGbp(p.pnlGbp, true)}</td>
              <td className="py-2 pr-4">{formatTooltipPct(p.totalReturn, true)}</td>
              <td className="py-2">{p.isOpen ? "Open" : "Closed"}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="Return vs invested"
      caption="One dot per stock: money put in × result"
      captionMetric="totalReturn"
      table={table}
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <Legend
          items={[
            { id: "open", name: "Open", color: "var(--slot-1)", mark: "dot" },
            { id: "closed", name: "Closed", color: "var(--muted)", mark: "dot" },
          ]}
        />
        <div className="flex shrink-0 gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("pct")}
            className={`${mode === "pct" ? "text-ink" : "text-muted"} ${FOCUS}`}
          >
            %
          </button>
          <span className="text-muted">/</span>
          <button
            type="button"
            onClick={() => setMode("gbp")}
            className={`${mode === "gbp" ? "text-ink" : "text-muted"} ${FOCUS}`}
          >
            £
          </button>
        </div>
      </div>
      <ReturnVsInvestedPlot positions={positions} mode={mode} />
    </ChartCard>
  );
}
