"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChartCard,
  DivergingBars,
  formatAxisGbp,
  formatAxisPct,
  formatTooltipGbp,
  LinearLineChart,
  useChartSize,
} from "@/components/charts";
import { formatGbp } from "@/lib/format/numbers";
import type { RuleParamDef } from "@/lib/metrics/rules";

type IdlePolicy = "cash" | "benchmark" | "prorata";

type RuleMeta = {
  id: string;
  label: string;
  params: RuleParamDef[];
};

type SweepPoint = {
  params: Record<string, number>;
  deltaGbp: number;
  deltaXirr: number | null;
  nAffected: number;
  capitalAffectedGbp: number;
  splitHalf: { first: number | null; second: number | null; signFlip: boolean };
  clamps: { forcedSellClamps: number; unfundedBuys: number };
  perPosition: { ticker: string; name: string; deltaGbp: number }[];
};

type ReplayResponse = {
  sweep: SweepPoint[];
};

export function paramValueAtIndex(param: RuleParamDef, index: number): number {
  const clamped = Math.max(0, Math.min(index, param.values.length - 1));
  return param.values[clamped]!;
}

export function paramIndexForValue(param: RuleParamDef, value: number): number {
  const idx = param.values.indexOf(value);
  if (idx >= 0) return idx;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < param.values.length; i++) {
    const dist = Math.abs(param.values[i]! - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function defaultParamIndices(rule: RuleMeta): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of rule.params) {
    out[p.key] = Math.floor(p.values.length / 2);
  }
  return out;
}

function indicesToParams(
  rule: RuleMeta,
  indices: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of rule.params) {
    out[p.key] = paramValueAtIndex(p, indices[p.key] ?? 0);
  }
  return out;
}

function SweepChart({ sweep, primaryKey }: { sweep: SweepPoint[]; primaryKey: string | null }) {
  const { width, height } = useChartSize();

  const points = useMemo(() => {
    const useGbp = sweep.some((s) => Math.abs(s.deltaGbp) > 1e-6);
    return sweep.map((s) => {
      const x = primaryKey != null ? (s.params[primaryKey] ?? 0) : 0;
      const y = useGbp ? s.deltaGbp : (s.deltaXirr ?? 0);
      return {
        x,
        y,
        n: s.nAffected,
        label: primaryKey != null ? String(x) : "—",
      };
    });
  }, [sweep, primaryKey]);

  const useGbp = sweep.some((s) => Math.abs(s.deltaGbp) > 1e-6);

  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No sweep points</p>;
  }

  return (
    <LinearLineChart
      points={points}
      width={width}
      height={height}
      yFormat={useGbp ? formatAxisGbp : formatAxisPct}
      xFormat={(n) => String(n)}
    />
  );
}

function PerPositionChart({ point }: { point: SweepPoint | null }) {
  const { width } = useChartSize();

  const data = useMemo(() => {
    if (!point) return [];
    return point.perPosition.map((p) => ({
      id: p.ticker,
      name: p.name,
      value: p.deltaGbp,
    }));
  }, [point]);

  if (!point || data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No position breakdown</p>;
  }

  return (
    <DivergingBars
      data={data}
      width={width}
      barHeight={20}
      gap={8}
      formatValue={(n) => formatTooltipGbp(n, true)}
    />
  );
}

export function ReplayLab() {
  const [rules, setRules] = useState<RuleMeta[]>([]);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [ruleId, setRuleId] = useState<string>("");
  const [paramIndices, setParamIndices] = useState<Record<string, number>>({});
  const [policy, setPolicy] = useState<IdlePolicy>("cash");
  const [sweep, setSweep] = useState<SweepPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedRule = useMemo(
    () => rules.find((r) => r.id === ruleId) ?? null,
    [rules, ruleId],
  );

  const primaryKey = selectedRule?.params[0]?.key ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/replay");
        if (!res.ok) throw new Error("Could not load replay rules");
        const data = (await res.json()) as { rules: RuleMeta[] };
        if (cancelled) return;
        setRules(data.rules);
        if (data.rules.length > 0) {
          const first = data.rules[0]!;
          setRuleId(first.id);
          setParamIndices(defaultParamIndices(first));
        }
      } catch (e) {
        if (!cancelled) {
          setRulesError(e instanceof Error ? e.message : "Failed to load rules");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runReplay = useCallback(
    async (immediate = false) => {
      if (!selectedRule) return;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      const execute = async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setRunError(null);

        try {
          const res = await fetch("/api/replay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ruleId: selectedRule.id,
              params: indicesToParams(selectedRule, paramIndices),
              policy,
            }),
            signal: controller.signal,
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(
              typeof body.error === "string" ? body.error : "Replay failed",
            );
          }
          const data = (await res.json()) as ReplayResponse;
          if (!controller.signal.aborted) {
            setSweep(data.sweep);
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          if (!controller.signal.aborted) {
            setRunError(e instanceof Error ? e.message : "Replay failed");
            setSweep([]);
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      };

      if (immediate) {
        await execute();
      } else {
        debounceRef.current = setTimeout(() => {
          void execute();
        }, 200);
      }
    },
    [selectedRule, paramIndices, policy],
  );

  useEffect(() => {
    if (!selectedRule) return;
    void runReplay();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [selectedRule, paramIndices, policy, runReplay]);

  const handleRuleChange = (id: string) => {
    const rule = rules.find((r) => r.id === id);
    setRuleId(id);
    if (rule) setParamIndices(defaultParamIndices(rule));
  };

  const selectedSweepPoint = useMemo(() => {
    if (sweep.length === 0) return null;
    if (!selectedRule || !primaryKey) return sweep[Math.floor(sweep.length / 2)] ?? null;
    const target = paramValueAtIndex(
      selectedRule.params[0]!,
      paramIndices[primaryKey] ?? 0,
    );
    let best = sweep[0]!;
    let bestDist = Infinity;
    for (const s of sweep) {
      const v = s.params[primaryKey] ?? 0;
      const dist = Math.abs(v - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    return best;
  }, [sweep, selectedRule, primaryKey, paramIndices]);

  if (rulesError) {
    return (
      <section className="space-y-4">
        <h2 className="text-base font-medium text-ink">Replay lab</h2>
        <p className="text-sm text-muted">{rulesError}</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-medium text-ink">Replay lab</h2>
        <p className="mt-1 text-sm text-muted">
          Sweep a buy rule across parameter values — in-sample, one portfolio
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-muted">Rule</span>
          <select
            value={ruleId}
            onChange={(e) => handleRuleChange(e.target.value)}
            className="mt-1 block w-full border-b border-border bg-transparent py-1.5 text-ink focus:outline-none"
          >
            {rules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="text-sm">
          <legend className="text-muted">Idle policy</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-ink">
            {(["cash", "benchmark", "prorata"] as const).map((p) => (
              <label key={p} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="idle-policy"
                  value={p}
                  checked={policy === p}
                  onChange={() => setPolicy(p)}
                  className="accent-ink"
                />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {selectedRule && selectedRule.params.length > 0 && (
        <div className="space-y-4">
          {selectedRule.params.map((param) => {
            const idx = paramIndices[param.key] ?? 0;
            const value = paramValueAtIndex(param, idx);
            const maxIdx = param.values.length - 1;
            return (
              <label key={param.key} className="block text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-muted">{param.label}</span>
                  <span className="tabular text-ink">{value}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxIdx}
                  step={1}
                  value={idx}
                  onChange={(e) =>
                    setParamIndices((prev) => ({
                      ...prev,
                      [param.key]: Number(e.target.value),
                    }))
                  }
                  onMouseUp={() => void runReplay(true)}
                  onTouchEnd={() => void runReplay(true)}
                  className="mt-2 w-full accent-ink"
                />
              </label>
            );
          })}
        </div>
      )}

      {loading && <p className="text-sm text-muted">Running…</p>}
      {runError && <p className="text-sm text-muted">{runError}</p>}

      <ChartCard
        title="Sweep"
        caption="in-sample · 2.5 years · one portfolio"
        titleMetric="replayDelta"
        table={
          sweep.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  {primaryKey && <th className="py-2 pr-4">{primaryKey}</th>}
                  <th className="py-2 pr-4">Δ GBP</th>
                  <th className="py-2 pr-4">n affected</th>
                  <th className="py-2">Capital</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {sweep.map((s, i) => (
                  <tr key={i} className="border-b border-border">
                    {primaryKey && (
                      <td className="py-2 pr-4">{s.params[primaryKey]}</td>
                    )}
                    <td className="py-2 pr-4">{formatGbp(s.deltaGbp, { signed: true })}</td>
                    <td className="py-2 pr-4">{s.nAffected}</td>
                    <td className="py-2">{formatGbp(s.capitalAffectedGbp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : undefined
        }
      >
        {sweep.length === 0 && !loading ? (
          <p className="py-8 text-center text-sm text-muted">Adjust controls to run a sweep</p>
        ) : (
          <SweepChart sweep={sweep} primaryKey={primaryKey} />
        )}
      </ChartCard>

      <ChartCard
        title="Per-position effect"
        caption={
          selectedSweepPoint?.splitHalf.signFlip
            ? undefined
            : "Δ GBP by holding for the selected sweep point"
        }
        table={
          selectedSweepPoint && selectedSweepPoint.perPosition.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-4">Stock</th>
                  <th className="py-2">Δ GBP</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {selectedSweepPoint.perPosition.map((p) => (
                  <tr key={p.ticker} className="border-b border-border">
                    <td className="py-2 pr-4">{p.name}</td>
                    <td className="py-2">{formatGbp(p.deltaGbp, { signed: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : undefined
        }
      >
        {selectedSweepPoint?.splitHalf.signFlip && (
          <p className="mb-3 text-sm text-negative">sign flip across halves</p>
        )}
        <PerPositionChart point={selectedSweepPoint} />
      </ChartCard>
    </section>
  );
}
