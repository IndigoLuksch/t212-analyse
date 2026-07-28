"use client";

import { useMemo, type ComponentProps } from "react";
import { TimeRangeControl } from "@/components/charts";
import { AllocationChart } from "./AllocationChart";
import { ContributionChart } from "./ContributionChart";
import { HoldingsTable } from "./HoldingsTable";
import { PerformanceChart } from "./PerformanceChart";
import { ScatterHoldingsChart } from "./ScatterHoldingsChart";
import { ValueInvestedChart } from "./ValueInvestedChart";
import { clipToRange, toDatePoints, useChartWidth, useDateRange } from "./chartUtils";

interface PortfolioChartsProps {
  valueSeries: { date: string; value: number }[];
  investedSeries: { date: string; value: number }[];
  twr: { date: string; index: number }[];
  benchTwr: { date: string; index: number }[];
  allocation: { date: string; weights: Record<string, number> }[];
  tickerMeta: ComponentProps<typeof AllocationChart>["tickerMeta"];
  scatter: ComponentProps<typeof ScatterHoldingsChart>["points"];
  excludedScatter: number;
  benchmarkXirr: number | null;
  contribution: ComponentProps<typeof ContributionChart>["contribution"];
  contributionStat: string | null;
  positions: ComponentProps<typeof HoldingsTable>["positions"];
}

export function PortfolioCharts({
  valueSeries,
  investedSeries,
  twr,
  benchTwr,
  allocation,
  tickerMeta,
  scatter,
  excludedScatter,
  benchmarkXirr,
  contribution,
  contributionStat,
  positions,
}: PortfolioChartsProps) {
  const { ref, width } = useChartWidth();

  const minDate = valueSeries[0]?.date ?? "";
  const maxDate = valueSeries.at(-1)?.date ?? "";

  const [range, setRange] = useDateRange({
    min: minDate,
    max: maxDate,
    initial: { start: minDate, end: maxDate, preset: "Max" },
  });

  const context = useMemo(() => toDatePoints(valueSeries), [valueSeries]);

  const clippedValue = useMemo(() => clipToRange(valueSeries, range), [valueSeries, range]);
  const clippedInvested = useMemo(
    () => clipToRange(investedSeries, range),
    [investedSeries, range],
  );
  const clippedTwr = useMemo(() => clipToRange(twr, range), [twr, range]);
  const clippedBenchTwr = useMemo(() => clipToRange(benchTwr, range), [benchTwr, range]);
  const clippedAllocation = useMemo(() => clipToRange(allocation, range), [allocation, range]);

  return (
    <div ref={ref} className="space-y-4">
      <TimeRangeControl
        width={width}
        min={minDate}
        max={maxDate}
        value={range}
        onChange={setRange}
        context={context}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <ValueInvestedChart valueSeries={clippedValue} investedSeries={clippedInvested} />
        <PerformanceChart twr={clippedTwr} benchTwr={clippedBenchTwr} />
        <AllocationChart
          allocation={clippedAllocation}
          valueSeries={clippedValue}
          tickerMeta={tickerMeta}
        />
        <ScatterHoldingsChart
          points={scatter}
          excludedCount={excludedScatter}
          benchmarkXirr={benchmarkXirr}
        />
        <ContributionChart contribution={contribution} contributionStat={contributionStat} />
        <div className="lg:col-span-2">
          <HoldingsTable positions={positions} />
        </div>
      </div>
    </div>
  );
}
