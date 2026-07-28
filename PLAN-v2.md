# PLAN-v2 — revision pass after first review

This document is the **task spec for the next implementation pass**. It supersedes the
named sections of [PLAN.md](./PLAN.md) where the two disagree; everywhere else PLAN.md
still governs (product principles, design tokens, mark specs, metric definitions).

The app currently works end-to-end against real synced data (456 orders, 43 traded
instruments, 44 symbols with price history, 112k daily bars). This pass is **revision,
not new surface**: two metric families get deleted (rotation, and every partial P&L variant),
several get corrected, and the chart layer gets three structural fixes that resolve most of
the reported UI faults at once.

---

## 0. How to work

```bash
pnpm dev        # localhost:3000 — real synced data is already in data/app.db
pnpm test       # vitest, metrics library
pnpm build      # must stay green
pnpm lint
```

Rules for this pass:

1. **One commit per work item (W1…W10), in the order given.** The order is dependency-
   ordered: primitives before consumers, metric fixes before the tooltips that describe them.
2. `/dev/charts` is the fixture storybook. Every primitive touched here must still render
   there, in light **and** dark. If you change a primitive's props, update that page in the
   same commit — a broken `/dev/charts` is a broken commit.
3. `pnpm test` and `pnpm build` green at the end of every work item.
4. Any behaviour change to a metric needs a golden-fixture test in
   `src/lib/metrics/__tests__/` with the expected number computed by hand in a comment.
5. **Delete, don't deprecate.** No dead exports, no commented-out code, no `_unused` props.
   This codebase is single-user and pre-release; there is nothing to keep compatible with.
6. Do not add libraries. Charts stay hand-built SVG over `d3-scale` / `d3-shape` / `d3-array`.

---

## 1. Request → work item map

| # | Request | Work item |
|---|---|---|
| 1 | Drop the "proceeds went into other stocks" idea | **W1** — delete rotation end-to-end |
| 2 | `(?)` on every non-standard metric (e.g. "averaging down") | **W3** — metric glossary + full `(?)` coverage (needs **W2** first, so the definitions are true) |
| 3 | Stock chart shouldn't default to fully zoomed out | **W6** — "Held" default window |
| 4 | Every graph needs a date-range slider | **W5** — `RangeBrush` + `TimeRangeControl` |
| 5 | Allocation tooltip lists every ticker and clips | **W7** — hovered band only (+ **W4** removes the clipping) |
| 6 | Stock chart has no y-axes / unlabelled lines | **W6** — axes, units, legend |
| 7 | Remove the "net invested" metric | **W8** — KPI row rework |
| 8 | Why is the hero +1,585 but realised P&L different? | **§2** below + **W8** |
| 9 | Dot hovers show nothing, or a clipped label | **W4** — single HTML tooltip layer |
| 10 | Remove P&L; the only metric that matters is realised + unrealised profit | **W8** — one profit metric, app-wide |
| 11 | "Chart rendering usually isn't great" | **W10** — chart engine hardening (root causes measured, §3) |
| 12 | Full-screen any graph | **W11** — expand affordance on `ChartCard` |

Two supporting items fall out of the above: **W2** (metric correctness bugs that would make
the new `(?)` text a lie) and **W9** (cheap perf wins). **W12** is the closing sweep.

---

## 2. Answer to "why is it +1,585 at top and realised P&L a different number?"

Both numbers are computed correctly for what they measure. They measure different things,
and the KPI tile's label ("Realised P&L") describes something the number is not.

Verified against `data/app.db` today:

| Figure | Value | What it actually is |
|---|---|---|
| Hero P&L | **+£1,584.74** | Every pound in vs every pound out or still on the table: `sells − buys + dividends + current market value` |
| KPI "Realised P&L" | **+£247.38** | P&L of the **30 fully-closed episodes only** — a position that has been sold down but not to zero contributes nothing |

The gap of £1,337.36 is real money and it decomposes exactly:

```
realised on all sells (moving-average basis)   £1,311.61
dividends received                             £  134.62
unrealised on the 19 open positions            £  138.51
                                               ──────────
total                                          £1,584.74   ✓ = hero
```

So: £1,311.61 of gains have actually been **booked**, but the tile only shows the £247.38
that happened to be booked inside episodes that closed completely. £1,064 of realised gains
sit invisibly inside positions that are still open.

**Fix (W8): delete the second number rather than reconcile it.** The app ends up with exactly
one profit metric — **realised + unrealised**, the £1,584.74 figure — computed by the same
formula at every scope (portfolio, position, closed round trip). Partial variants (realised
only, closed-episodes only, and the realised/dividends/unrealised split) do not appear
anywhere. Two numbers can't look unrelated when there is only one.

---

## 3. "Should we write our own chart library?" — you already did; don't start over

`src/components/charts/` is 20 files and ~1,900 lines of hand-built SVG marks over
`d3-scale` / `d3-shape` — scales, axes, crosshair, six mark types, a synced-panel container,
a fixture storybook. That was the right call and PLAN.md mandates it: the design system here
is exact (2px surface gaps between stacked bands, ≥8px markers with a 2px surface ring, one
tooltip listing every series at an x, colour bound to the entity), and general-purpose
libraries fight every one of those rules.

**The rendering problems are not missing primitives.** All four are ordinary bugs in the
layer around the primitives, and each was measured in your running app:

1. **Charts are sized once, against the wrong box.** The width comes from the element
   *wrapping* the card, which is 42px wider than the area the SVG draws into — and the
   `ResizeObserver` never fires an update. Resizing the window 1900px → 1024px left the SVGs
   at 842px inside 434px cards: 408px of chart drawn outside its card. That single defect
   produces most of what "isn't great" in your screenshot.
2. **Tick counts ignore the available width.** Ten `Apr 2024`-style labels need ~480px; the
   cards give 434px. Hence `Apr 2024Jul 2024Oct 2024` running together.
3. **Scatter dots scale radius, not area, by capital** — a 6× position gets 36× the ink, which
   is the giant blue dot sitting on top of the "benchmark XIRR" label.
4. **The allocation chart picks its bands by current weight but its colours by lifetime peak
   value**, so six of eight bands resolve to the same grey. Hence the grey soup.

Rewriting from scratch would re-solve what `d3-scale`/`d3-shape` already solve correctly
(they are maths, not rendering, and they are not the problem) and would re-introduce these
same four bugs, because they live in the layout/interaction layer that a rewrite would also
have to write. **W10** fixes them in roughly a day's work.

What is genuinely missing is not a *library* but five small modules in the layer you already
own — and three of them are already scoped in this document:

| Module | Status |
|---|---|
| Measurement / responsive layout | **W10.1** |
| Tick budgeting + label collision | **W10.2** |
| One tooltip layer (unclipped, client-space) | **W4** |
| Range brush / zoom | **W5** |
| Full-screen | **W11** |

Finish those and you have a purpose-built chart kit that does exactly what this app needs and
nothing else — which is the strongest form of "our own library".

**When a library *would* be the right call** — none of these apply to you today, but for the
record: animation and transitions (d3-transition, or Framer); zoom/pan with inertia across
100k+ points, where SVG stops coping and you need canvas or WebGL (uPlot, ECharts); or wanting
charts you have not specified, quickly, and being willing to accept their visual defaults
(Recharts, Observable Plot). Note that `visx` is not a counter-example — it is d3 wrapped in
React components, i.e. what `src/components/charts/` already is. Adopting it would be a
lateral move that imports someone else's opinions about tooltips and legends.

**Verdict: keep the hand-built kit, fix W10, add W11.** Revisit only if you later want
animated transitions or datasets an order of magnitude larger.

---

## W1 — Delete the rotation metric

**Why:** the idea that a specific sale's proceeds funded a specific later purchase is a
fiction the 30-day greedy matcher invents. It is being removed, not hidden.

**Keep** the ghost / "kept vs sold" metric — that one only asks what the *sold shares* did,
which is a real question. It is currently entangled with rotation in a few places; untangle it.

**Files:**

- Delete `src/lib/metrics/rotation.ts`.
- `src/lib/metrics/index.ts` — drop `export * from './rotation'`.
- `src/lib/metrics/types.ts` — delete `RotationAllocation`, `RotationResult`.
  `InstrumentData` currently lives in `rotation.ts` and is imported by
  `src/lib/analysis/portfolio.ts` — **move it to `types.ts`** before deleting the file, or
  delete it too if nothing else uses it (check: after W1 only `instrumentData()` in
  `portfolio.ts` produces it, and that helper exists solely for rotation → delete both).
- `src/lib/analysis/portfolio.ts`:
  - remove `computeRotation` from the metrics import,
  - delete `buildSubsequentBuys()` (rotation-only),
  - delete `instrumentData()` if unused after the above,
  - `computeStock()` — drop `rotation` from each pushed exit row,
  - `computeDecisions()` — delete `rotationDeltas`, `rotWins`, `rotationSentence`, the
    `rotationDelta` / `rotationSentence` fields on `ExitRow`, `kpis.rotationRecord`, and the
    now-unused `fmtPct()` helper at the bottom of the file,
  - `ghostReturnFromValues()` is only used to feed rotation → delete it too.
- `src/app/decisions/page.tsx` — delete the "Rotation record" `StatTile` and `const rot = …`.
  The KPI grid drops from 6 tiles to 5; keep `lg:grid-cols-5`.
- `src/components/decisions/ExitTable.tsx` — delete the `Rotation Δ` column, the
  `rotationDelta` sort key, `rotationSentence` from the row type, and the
  `{row.rotationSentence}` fallback in the Note cell (empty note → render nothing).
- `src/components/stock/ExitsSection.tsx` — delete the `rotation` prop, `rotationSentence()`,
  `fmtPctShort()`, and the `<p>{sentence}</p>` line.
- `src/app/stocks/[ticker]/page.tsx` — the local `listSwitcherInstruments()` call builds
  `tickerNames` purely to name rotation targets; drop the call and the prop. **Keep the
  exported function** — `src/app/layout.tsx` uses it for the ⌘K switcher.
- `src/lib/metrics/__tests__/metrics.test.ts` — delete the `describe('rotation matching')`
  block and the rotation imports.
- `src/lib/metrics/__tests__/fixtures.ts` — delete `rotationExit`, `rotationBuyNvda`,
  `rotationBuyAapl`, `expectedRotationRedeployReturn`, `expectedRotationCash`.
- `PLAN.md` — delete the **Rotation quality** paragraph in the metrics section, the rotation
  KPI in the `/decisions` description, the "rotation sentence" clause in the stock-page exit
  row description, and the "; see rotation" clause in the ghost aggregate note.

**Acceptance:** `grep -ri rotation src PLAN.md` returns nothing. Tests and build green.
`/decisions` and every stock page render with no empty columns or dangling separators.

---

## W2 — Metric correctness fixes (do before writing any `(?)` text)

Three metrics do not currently compute what PLAN.md says they compute. W3 is about putting a
plain-English definition on every number; these must be fixed first, or the definitions
become wrong-by-construction.

### W2.1 — Tranche returns: reset per episode, value at the right date

`src/lib/metrics/returns.ts` → `computeTrancheReturns()`. Two defects:

1. The running average cost never resets at an episode boundary. Buy → full exit → re-entry
   classifies the re-entry against the *old* position's average cost. Classification must be
   made against the running average cost **within the current episode**, and the first buy of
   every episode is the base tranche (not a tranche).
2. Every tranche is valued at `closeOnDate(prices, asOfDate)` — today — even for positions
   closed years ago. PLAN.md specifies "tranche date to **episode end** (or today)".

**Change the signature** to take episodes (from `buildEpisodes`) and value each tranche at
`min(episode end, asOfDate)`, using today's close only for the open episode:

```ts
export function computeTrancheReturns(input: {
  orders: Order[];
  splits: Split[];
  prices: PriceBar[];
  fxRates: FxRate[];
  currency: string;
  episodes: Episode[];
  asOfDate?: string;
}): { up: TrancheClass; down: TrancheClass; tranches: TrancheReturn[] };

interface TrancheClass { count: number; capitalGbp: number; totalReturn: number }
```

`totalReturn` stays capital-weighted within the class. Add `capitalGbp` to the class result —
W2.2 needs it. Update both call sites in `src/lib/analysis/portfolio.ts`.

**Test:** fixture with two episodes (buy 100 @ 10 → buy 50 @ 8 → sell all @ 12 → buy 10 @ 20),
assert the fourth buy is *not* classified against the first episode's average, and that the
closed episode's tranche return is measured to the exit close, not to today's.

### W2.2 — Averaging up/down aggregation is weighted by tranche count, not capital

`src/lib/analysis/portfolio.ts` → `computeDecisions()`, the `averaging` accumulator:

```ts
// current — weights each instrument's capital-weighted return by its *tranche count*
averaging.downRet += trancheResult.down.totalReturn * trancheResult.down.count;
averaging.downCap += trancheResult.down.count;
```

PLAN.md specifies capital-weighted. With `capitalGbp` from W2.1:

```ts
averaging.downRet += trancheResult.down.totalReturn * trancheResult.down.capitalGbp;
averaging.downCap += trancheResult.down.capitalGbp;
```

Same for `up`. Keep exposing `n` (tranche count) — the tile shows it beside the return, and
PLAN.md requires the counts to be visible.

### W2.3 — Buy discipline: fix the definition and the display unit

`computeBuyDiscipline()` computes **value-weighted average local fill price ÷ time-average
daily close over `[first buy, last buy]`** — which matches PLAN.md. The tooltip on
`/decisions` claims it is a "ratio of buy price to prior peak". That is simply wrong text;
it gets replaced in W3.

Also, the value is a **ratio**, not a percentage, but every call site renders it with
`formatPct()` → `0.98` shows as `98.0%`, indistinguishable from a return. Add:

```ts
// src/lib/format/numbers.ts
/** Ratio around 1.0, e.g. 0.98× — never a percentage; a ratio in % reads as a return. */
export function formatRatio(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return `${v.toFixed(2)}×`;
}
```

Use it in `src/app/stocks/[ticker]/page.tsx` (Buy discipline chip),
`src/app/decisions/page.tsx` (Buy discipline tile) and
`src/components/decisions/ClosedTripsTable.tsx` (Discipline column).

**Acceptance:** new fixtures pass; the averaging up/down numbers on `/decisions` change
(expected); nothing else moves.

---

## W3 — Metric glossary and full `(?)` coverage

**Why:** "averaging down 12.4%" is unreadable without a definition, and the one tooltip that
does exist for buy discipline is wrong. Definitions must live in exactly one place so they
cannot drift from the code again.

### W3.1 — `src/lib/metrics/glossary.ts` (new)

```ts
export interface MetricDef {
  /** Tooltip heading — matches the on-screen label. */
  label: string;
  /** One sentence: what it measures AND how it's computed. No jargon left undefined. */
  definition: string;
}

export const METRICS = {
  totalReturn: {
    label: "Total return",
    definition:
      "All money out plus what you still hold, divided by all money in — net of fees, in GBP.",
  },
  xirr: {
    label: "XIRR",
    definition:
      "The constant yearly rate that would turn your actual deposits and withdrawals, on their actual dates, into today's value. Shown as – for positions held under 6 months, where annualising would overstate.",
  },
  // …
} as const satisfies Record<string, MetricDef>;

export type MetricId = keyof typeof METRICS;
```

### W3.2 — `MetricTip` takes a `metric` id

`src/components/ui/MetricTip.tsx`:

```tsx
type MetricTipProps =
  | { metric: MetricId; children?: ReactNode }
  | { label: string; definition: string; children?: ReactNode }; // escape hatch, avoid
```

While in the file, fix three small things:
- the `?` button is a `<button>` that does nothing on click — make click toggle `open`
  (touch and click users currently get nothing),
- add `aria-describedby` wiring between the button and the tooltip,
- the tooltip is `absolute … bottom-full left-1/2` with a fixed `w-56`; inside a table cell or
  near the viewport edge it clips. Clamp it: `max-w-[min(14rem,calc(100vw-2rem))]` and flip to
  `top-full` when the trigger is in the top 120px of the viewport (measure on open).

### W3.3 — Required definitions

Write all of these. Each is one sentence, plain English, states the unit, and says how it's
computed. Where a rule applies (the <182-day XIRR suppression), say it in the tooltip.

**Portfolio (`src/app/page.tsx`)** — hero line and KPI row (see W8 for the new row):
`profit` (the hero figure), `totalReturn`, `xirr`, `pickingEdge` (exists — keep the wording),
`dividendsReceived`, `currentValue` *(standard — no tip needed)*.

**Portfolio cards:**
- Value vs invested → `netCashIn`
- Performance vs benchmark → `twr`, `benchmark`
- Allocation over time → `allocationWeight`
- Hold time × annual return → `xirr`, `dotArea` ("dot area is capital deployed"),
  `benchmarkXirr` (the reference line)
- Contribution → `profit` (same id, same sentence — it is the same metric per stock)
- Holdings table headers → `profit`, `avgCost`, `weight`, `xirr`, `decomposition`

**Stock page (`src/app/stocks/[ticker]/page.tsx`)** chips:
`profit`, `xirr` **or** `totalReturn` (whichever the chip is showing — see W6.5),
`buyDiscipline`, `worstPoint`, `dividendsReceived`.
Exits section: `postExitRaw`, `postExitAdjusted`, `keptVsSold`.
Decomposition section: `decomposition` (must state the FX-residual convention).

**Decisions (`src/app/decisions/page.tsx`)** tiles:
`medianAdj6m` (exists), `averagingDown`, `averagingUp` ← *the reported gap*,
`buyDiscipline` ← *currently wrong*, `moneyLeftOnTable`.
Exit table headers: `postExitRaw`, `postExitAdjusted`, `keptVsSold`.
Closed trips footer: `winRate`, `profitFactor` (exist), plus `worstPoint`, `buyDiscipline` on
those column headers.

Reference wording for the two that prompted this request:

> **Averaging down** — "Every buy you made *below* your running average cost, weighted by the
> money you put in: what that money returned in GBP from the buy date to the position's exit
> (or today if still open). The tranche count beside it is how many such buys there were."

> **Buy discipline** — "Your value-weighted average buy price ÷ the stock's average daily
> close between your first and last buy. Below 1.00× means your staggered buying beat buying
> the same amount on a fixed schedule. Shown as – when you accumulated in under 7 days."

### W3.4 — Placement rule

`(?)` goes on the **label**, not the value, and never inside a link. In `StatTile`, allow the
label row to carry it:

```tsx
<StatTile label="Averaging down" metric="averagingDown" value="+12.4%" sub="6 tranches" />
```

i.e. give `StatTile` and `StatChip` an optional `metric?: MetricId` prop that renders
`<MetricTip metric={…} />` immediately after the label text. Table headers get the same
treatment inline. **Do not** stack a tip in both `label` and `sub` — the current Decisions
page does this in two tiles; it reads as clutter.

**Acceptance:** every number on all three pages is either (a) self-evident from a plain
English label ("Current value", "Shares", "Dividends") or (b) has a `(?)`. Walk the pages and
check. No definition text is duplicated in more than one file.

---

## W4 — One HTML tooltip layer (fixes every "hover shows nothing / clipped" bug)

**Why (root cause):** there are three different tooltip mechanisms today and each fails
differently.

| Chart | Mechanism | Failure |
|---|---|---|
| Hold-time scatter | `StandaloneTooltip` in a `<foreignObject>` | Hover detection is offset by the margins — `ScatterPlot` measures the pointer against the **SVG** rect but its points are inside `translate(52,12)`, so you must hover ~52px right and 12px below a dot to hit it. Then the tooltip is clipped by the foreignObject box. |
| Sell-timing strip | same | Tooltip div is positioned inside a 72px-tall `<foreignObject>` → cut off. Also the point's `detail` (date · ticker) is computed and never rendered. |
| Monthly net flow | same | Same clipping. |
| Trade markers (buy/sell triangles) | SVG `<title>` gated on `t.label` | `StockChart` never passes `label`, so **there is no tooltip at all** on any buy or sell marker. |
| Crosshair (line/area/stacked) | `<foreignObject>` sized `entries.length * 36 + 28` | With 20+ series it is taller than the SVG and gets clipped — this is the allocation-chart complaint. |

`foreignObject` + `overflow:visible` is not reliably honoured, and mixing client-space and
plot-space coordinates is what breaks hit-testing. Replace all of it with **one HTML overlay
positioned in client coordinates**, which cannot clip and cannot be off by a transform.

### W4.1 — `src/components/charts/TooltipLayer.tsx` (new)

```tsx
"use client";

export interface TooltipRow { label: string; value: string; color?: string }
export interface TooltipPayload { title?: string; rows: TooltipRow[]; footer?: string }

interface TooltipApi {
  /** Client coordinates — the layer converts against its own rect. */
  show: (clientX: number, clientY: number, payload: TooltipPayload) => void;
  hide: () => void;
}

export function TooltipLayer({ children }: { children: ReactNode }): JSX.Element;
/** No-op when there is no provider, so primitives stay usable standalone. */
export function useTooltip(): TooltipApi;
```

Implementation notes:
- wrapper `<div className="relative">`; tooltip is `position:absolute`, `pointer-events:none`,
  `z-20`, `max-width: 15rem`, styled exactly like today's tooltip (`rounded border
  border-border bg-surface px-3 py-2 shadow-sm`, 12px).
- Position: measure the tooltip node with a ref after render; flip horizontally when
  `x + w + 12 > rect.width`, flip vertically when `y + h + 12 > rect.height`, clamp to
  `[0, rect.width - w]`. **Never clip.**
- Value first and bold, series name second, keyed by a short colour stroke — unchanged from
  the current design.
- Throttle to one update per animation frame (`requestAnimationFrame`) so 2,000-point
  crosshairs stay smooth.
- Insert all strings as text nodes (React does this); no `dangerouslySetInnerHTML` anywhere.

### W4.2 — Wire it in

- `ChartCard` wraps its `children` in `<TooltipLayer>`. Every card-hosted chart gets it free.
- `StockChart` wraps its own root (it isn't in a card).
- `ChartPlot` and `SyncedPanels`: keep the SVG crosshair **line**; delete the
  `<CrosshairTooltip>` render and call `useTooltip().show(e.clientX, e.clientY, …)` from the
  existing `handleMouseMove`, `hide()` from `onMouseLeave`. Add a
  `crosshairTooltip?: boolean` prop (default `true`) — W7 turns it off for the allocation chart.
- Delete `CrosshairTooltip.tsx` entirely (both exports); remove from `index.ts`.

### W4.3 — Fix the mark components

- **`ScatterPlot`** — hit-test in the same space as the points. Simplest correct version:
  ```tsx
  onMouseMove={(e) => {
    const rect = e.currentTarget.getBoundingClientRect();   // the <g>'s own bbox in client space
    // …or take the pointer via the transparent <rect> that already spans the plot:
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
  }}
  ```
  Attach the handler to the transparent full-plot `<rect>` (which *is* in plot space) and use
  its `getBoundingClientRect()`, not the owner SVG's. Then show a tooltip with **name, hold
  time, XIRR, capital deployed, open/closed** — today it shows the y value alone.
- **`StripPlot`** — render the `detail` field (it is already built: `28 Mar 2024 · NVDA_US_EQ`).
  Tooltip rows: stock name (title), index-adjusted 6m return, exit date. Use `onMouseMove` on
  a full-width transparent rect with nearest-point search rather than per-circle
  `onMouseEnter` (8px circles at 24px minimum hit target overlap; nearest-point is the spec).
  Keep `onMouseLeave` → `hide()`.
- **`ColumnSeries`** — swap the `foreignObject` for `useTooltip`; title = month
  (`Mar 2024`, not the crosshair's day-month format), row = signed GBP net flow.
- **`TradeMarkers`** — delete the `<title>` mechanism. On the transparent 24px hit circle,
  `onMouseEnter` → `show()` with a payload built by the caller:
  ```tsx
  interface TradeMarker { …; tooltip: TooltipPayload }
  ```
  `StockChart` builds it (see W6.4). Also add `onFocus`/`tabIndex={0}` on the hit circle so
  markers are keyboard reachable.

**Acceptance:** on `/`, hovering any scatter dot at its visual centre names the stock;
on `/decisions`, hovering any strip dot shows stock + date + value fully on screen even for
the leftmost and rightmost dots; on a stock page, hovering any buy/sell triangle shows a
populated tooltip; no `foreignObject` remains in `src/components/charts`.

---

## W5 — Date-range slider on every time-axis chart

**Why:** requested directly. The current control is four preset buttons plus two
`<input type="date">` boxes — no direct manipulation, and the date inputs are the kind of
widget PLAN.md's "sentences over widgets" rule exists to prevent.

**Scope note:** the brush applies to the four charts with a **time x-axis** — Value vs
invested, Performance vs benchmark, Allocation over time, and the stock page's three synced
panels. Contribution (bars by stock), Hold-time × return (scatter) and Sell timing (strip)
have no time axis, so they get no brush; they are cross-sectional views of the whole history
by definition. If you want those scoped by date later, that is a page-level filter, not a
per-chart slider — out of scope here.

### W5.1 — `src/components/charts/RangeBrush.tsx` (new)

```tsx
interface RangeBrushProps {
  width: number;
  /** Full extent of available data. */
  domain: [Date, Date];
  /** Current selection. */
  value: [Date, Date];
  onChange: (next: [Date, Date]) => void;
  /** Faint context sparkline drawn behind the track — portfolio value / stock close. */
  context?: DatePoint[];
  height?: number; // default 36
}
```

Behaviour:
- Track = full domain. Selected window drawn at full opacity; outside it, the context line
  drops to `CHART_MARKS.fadedOpacity` and a `--gridline` wash covers it. No dashed edges.
- Two handles: 3px `--baseline` bars with a transparent 24px-wide hit rect (PLAN.md hit-target
  rule). Drag either handle to resize; drag the selected window to pan; click the track to
  centre the window there.
- Minimum window: 10 data points, so the chart can never go empty.
- Keyboard: handles are `tabIndex={0}` with `role="slider"`, `aria-valuemin/max/now` as ISO
  dates. `←/→` = 1 day, `Shift+←/→` = 1 month, `Home/End` = domain edge.
- Pointer events: `onPointerDown` + `setPointerCapture`, `onPointerMove`, `onPointerUp`.
  Do not attach window listeners.
- The brush is a **presentational** component — it never owns state.

### W5.2 — `src/components/charts/TimeRangeControl.tsx` (replaces `TimeRangePresets.tsx`)

```tsx
export type RangePreset = "1Y" | "3Y" | "5Y" | "Max" | "Held";
export interface RangeState { start: string; end: string; preset: RangePreset | "Custom" }

interface TimeRangeControlProps {
  width: number;
  min: string;              // ISO, earliest available
  max: string;              // ISO, latest available
  value: RangeState;
  onChange: (next: RangeState) => void;
  presets?: RangePreset[];  // default ["1Y","3Y","5Y","Max"]
  /** Concrete window for a named preset — used for "Held" on stock pages. */
  resolvePreset?: (p: RangePreset) => { start: string; end: string } | null;
  context?: DatePoint[];
}
```

Layout — one row above the content it scopes, per PLAN.md:

```
1Y · 3Y · 5Y · Max        12 Mar 2021 – 28 Jul 2026
[──────▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓───────]   ← RangeBrush
```

The current range is stated as muted tabular text on the right — that replaces the two date
inputs, which are **deleted**. Moving the brush sets `preset: "Custom"` and un-highlights the
preset buttons. Clicking a preset snaps the brush.

### W5.3 — State hook

`src/components/portfolio/chartUtils.ts`:

```ts
export function useDateRange(opts: {
  min: string; max: string; initial: RangeState;
}): [RangeState, (r: RangeState) => void];

/** Replaces the current preset-driven filterByRange. */
export function clipToRange<T extends { date: string }>(data: T[], r: RangeState): T[];
```

Keep `filterByRange`'s behaviour for named presets (N years back from `max`), but always
resolve to concrete `start`/`end` strings in state so the brush and the charts read the same
two values. Delete the old `TimeRangeValue` type and its `"custom"` member.

### W5.4 — Consumers

- **Portfolio page** (`src/app/page.tsx`): **one** `TimeRangeControl` above the chart grid,
  scoping all three time-axis cards (a shared `RangeState` in a small
  `"use client"` wrapper component, e.g. `src/components/portfolio/PortfolioCharts.tsx`).
  Three sliders stacked in a two-column grid would be clutter; one control that scopes what
  is below it is both the design rule and less noise. Context sparkline = portfolio value.
  Default `Max`.
- **Stock page**: `TimeRangeControl` above the synced panels with
  `presets={["Held","1Y","3Y","5Y","Max"]}`, default `Held` (see W6.1). Context = daily close.
- `/dev/charts`: replace the `TimeRangePresets` demo with `TimeRangeControl` + a standalone
  `RangeBrush`.

**Acceptance:** dragging a handle on any of the four charts re-renders it within a frame, the
axis ticks re-nice to the new window, and the crosshair still snaps to real data points.
Keyboard: tab to a handle, arrow keys move it. `grep -r TimeRangePresets src` returns nothing.

---

## W6 — Stock chart: held-period default, real y-axes, labelled series, working markers

### W6.1 — Default to the period you owned it (request 3)

`src/lib/analysis/portfolio.ts` → `computeStock()` returns a new field:

```ts
heldRange: { start: string; end: string }
```

computed as:

```
firstFill = first order's UTC date
lastDate  = position open ? asOf : last exit date
span      = lastDate − firstFill (days)
pad       = clamp(round(span * 0.15), 30, 365)          // context either side
start     = max(firstPriceDate, firstFill − pad)
end       = min(lastPriceDate,  lastDate + pad)
```

The pad matters: for a closed position the whole point of the post-exit line is seeing what
happened *after*, so never clip the exit to the right edge. `Max` remains one click away.

`StockChart` initialises `useDateRange` with `{ …heldRange, preset: "Held" }` and passes
`resolvePreset` so clicking **Held** returns to it.

### W6.2 — Y-axes and units (request 6)

Currently: the price panel has an axis of bare numbers, the shares panel has 2 ticks of bare
numbers, and the **monthly flow panel has no y-axis at all**. Nothing says what any of it is.

Per panel, add a muted 10px unit caption at the top-left of the plot area (cheaper and more
legible than rotated axis titles, and consistent with the design system's restraint):

| Panel | Axis | Caption | Tick format |
|---|---|---|---|
| P1 Price | 4 ticks, gridlines | `USD / share` (the instrument's trading currency; `GBP` where the T212 currency is GBp/GBX) | currency-aware: `$142`, `£4.20` |
| P2 Shares held | 2 ticks (0 and max), no gridlines | `shares` | `formatShares` |
| P3 Monthly net flow | **new** `YAxis`, 2 ticks (±max), zero line already exists | `£ net bought / sold per month` | `formatAxisGbp` |

Add a currency-aware tick formatter to `src/components/charts/format.ts`:

```ts
export function makeAxisPriceFormatter(currency: string): (n: number) => string;
// "USD" → $, "GBP" → £, "EUR" → €, else `${n} ${currency}`
```

`StockChart` already receives `chartCurrency` in props but **currently ignores it** (it is
destructured away and never used) — wire it into both the caption and the formatter.

### W6.3 — Legend, and the avg-cost line bug

Add a `Legend` row above the panels: `Close` (slot-1 line), `Avg cost` (`--ink-secondary`
line), `Buy` (▲ polarity-pos), `Sell` (▼ polarity-neg), and `Dividend` (baseline dot) once
W6.6 lands. Post-exit continuation needs no legend entry — the annotation names it.

**Bug to fix while you are here:** `computeHoldings` sets `avgFillLocal: 0` on every day the
position is flat, so `avgCostSeries` plunges to zero outside holding periods. The grey line
currently draws a spike to the x-axis, and because `niceLinearDomain` is computed from
`priceData` only, that spike is drawn outside the y-domain. Emit a gap instead:

```ts
// src/lib/analysis/portfolio.ts, computeStock()
const avgCostSeries = holdings.daily.map((d) => ({
  date: d.date,
  value: d.shares > 0 ? d.avgFillLocal : Number.NaN,   // LineSeries already skips non-finite
}));
```

`LineSeries` has `.defined((d) => Number.isFinite(d.value))`, so `NaN` breaks the path
correctly. Type the series value as `number` and let NaN through — do not switch to `null`
without also updating `DatePoint`.

### W6.4 — Trade-marker tooltips (request 9, and PLAN.md's spec)

Markers have had no working tooltip since they were written (`label` was never passed).
Build a real payload in `StockChart` per PLAN.md:

- **Buy:** date · `qty @ price` in trading currency · GBP total incl. fees · that tranche's
  return to date (from `computeTrancheReturns().tranches`, matched on `trancheId === order.id`)
  · journal note if present.
- **Sell:** date · `qty @ price` · GBP proceeds net of fees · the exit event's post-exit
  1m/3m/6m/12m raw and index-adjusted returns · kept-vs-sold · journal note if present.
  Match the order to its exit event via `exit.orderIds.includes(order.id)`.

`computeStock()` already returns `tranches`, `exits` and `notes`; pass them into `StockChart`.

### W6.5 — Header chips

- The **Return** chip silently shows XIRR *or* total return depending on suppression, with no
  indication which. Label it `Return /yr` when annualised and `Return (total)` when
  suppressed, and attach the matching `(?)` (W3).
- **Buy discipline** → `formatRatio` (W2.3).
- Add `(?)` to P&L, Buy discipline, Worst point, Dividends.

### W6.6 — Dividend dots *(optional, do last)*

PLAN.md specifies small dots pinned to the price panel's baseline on ex-dividend dates.
`computeStock()` already returns `divEvents` and `StockChart` ignores them. Add 4px
`--slot-3` dots at `y = PRICE_H - 3`, with a tooltip row `Dividend · $0.24 / share`. Skip if
time is short — it is the only genuinely new mark in this pass.

**Acceptance:** open any closed position — the chart opens on the held window with visible
post-exit tail, three labelled axes, a legend, and every triangle hovers to a populated
tooltip. Open any position held under a month — the chart is still readable (the 30-day
minimum pad does its job).

---

## W7 — Allocation chart: show only the ticker under the cursor (request 5)

**Why it clips today:** `StackedArea` registers a crosshair getter that returns **one entry
per band**, and `CrosshairTooltip` sizes its `foreignObject` at `entries.length * 36 + 28` —
with 20+ tickers that is ~750px inside a 280px SVG, so it is cut off, and it is not what you
want to read anyway.

**Changes in `src/components/charts/StackedArea.tsx`:**

1. Add `tooltipMode?: "hovered" | "all"`, default `"hovered"`. Remove the crosshair
   registration in `"hovered"` mode.
2. Own the pointer inside the component: one transparent `<rect>` over the plot;
   `onPointerMove` → nearest date index (`nearestDateIndex`, already imported) → find the band
   whose stacked `[y0, y1]` interval contains the pointer's plot-space y → set `hoveredKey`
   and `show()` a tooltip with:
   - title: the date,
   - one row: the stock's **name**, its weight (`%` mode) or GBP value (`£` mode),
   - footer: `click to open` (muted) — the band click-through already exists.
3. `hoveredKey` also drives the existing fade (others → `CHART_MARKS.fadedOpacity`). Drive it
   from the pointer position, not per-path `onMouseEnter` — the 2px stack gaps mean
   `mouseenter` misses between bands and leaves stale highlights.
4. When the hovered band is `"other"`, the row reads `Other · n stocks` with the aggregate
   weight. No expansion.
5. **Bug:** absolute (`£`) mode formats the tooltip value as `String(val)` → `1234.5678901`.
   Use `formatTooltipGbp`.

**In `src/components/portfolio/AllocationChart.tsx`:** pass `crosshairTooltip={false}` to
`ChartPlot` (W4.2) so the two mechanisms don't both fire; keep the crosshair line.

**Perf:** the `series` memo currently calls `toDatePoints([{…}])[0]!.date` **once per
ticker per day** — 43 × ~1,900 = 80k throwaway arrays and `Date` objects per render, which is
why the hover feels sticky. Build the `Date[]` once (the `dates` memo already exists) and
index into it.

**Acceptance:** hovering anywhere in the stack shows exactly one stock, always fully on
screen, and the band under the cursor is the one named. In `£` mode the value reads `£1,235`.

---

## W8 — One profit metric, app-wide (requests 7, 8 and 10)

**The rule for this work item, and for the app from here on:**

> There is exactly **one** profit metric. It is **realised + unrealised profit** in GBP:
> money out + what you still hold − money in, net of fees, with dividends counted as realised
> (they are cash you received). It is labelled **Profit** wherever it appears. It is computed
> by the same formula at every scope — whole portfolio, one position, one closed round trip —
> so the portfolio figure is exactly the sum of the position figures.
>
> **No partial or decomposed profit metric appears anywhere:** no realised-only number, no
> unrealised-only number, no closed-episodes-only number, no realised/dividends/unrealised
> split. The term "P&L" is retired — one number, one word.

Good news for the diff: the per-position figure already computed as `pnlGbp`
(`returned + openValue − invested`) **is** this metric, and the hero already is its sum
(verified: Σ position `pnlGbp` = £1,584.74 = hero). So most of this item is deleting the
variants and unifying the label — not new arithmetic.

### W8.1 — Delete the two rejected KPI tiles

In `src/app/page.tsx`, delete:

- **`Invested / net`** — also mislabelled: it renders `Σ position.invested`, which is *gross*
  lifetime buys including fees (£8,218.92), not net of sells.
- **`Realised P&L`** — the closed-episodes-only figure (£247.38) that prompted request 8.
  It is **not replaced**: realised + unrealised is already on screen as the hero.

New KPI row — three tiles, `grid-cols-3`:

| Tile | Value today | Source |
|---|---|---|
| Current value | £1,067 | `openValue`, unchanged |
| Dividends | £135 | unchanged — a cash fact, not a profit variant |
| Win rate | 50.0% | unchanged, `sub="closed round trips"` |

Delete `kpis.invested` and `kpis.realisedPnL` from the `computePortfolio()` return type as
well — no dead fields. Do **not** add `realisedPnLGbp` / `costBasisGbp` to `PositionSummary`;
nothing needs them.

`computeHoldings()` keeps its internal `realisedPnLGbp` bookkeeping (it drives the
moving-average cost basis) — it simply stops surfacing to the UI.

> **Decision on the "Value vs invested" chart, flag if you disagree:** the card keeps its
> second series. A line showing money-in against value over time is the shape of the chart,
> not a metric on a tile, and it is the only place the accumulation pattern is visible. It is
> relabelled **"Net cash in"** with a `(?)` reading "cumulative buys minus sell proceeds,
> including fees — the money currently committed to positions". If you want it gone too,
> delete the `LineSeries` and the `investedSeries` prop and rename the card to "Portfolio
> value" — a one-line change in `ValueInvestedChart.tsx`.

### W8.2 — No reconciliation line under the hero

The hero keeps exactly what it has: the big number, then one quiet line of
`total return · XIRR · picking edge`. Add a `(?)` to the hero number itself
(`METRICS.profit`) so the definition is one hover away, and nothing more.

### W8.3 — Rename "P&L" → "Profit" everywhere it survives

These places already show realised + unrealised for their scope, so per your instruction they
are **kept and relabelled**, not removed:

| File | Change |
|---|---|
| `src/components/portfolio/HoldingsTable.tsx` | column header `P&L` → `Profit` (+ `(?)`), sort key `pnlGbp` unchanged |
| `src/app/stocks/[ticker]/page.tsx` | `StatChip label="P&L"` → `label="Profit"` (+ `(?)`) |
| `src/components/decisions/ClosedTripsTable.tsx` | column header `P&L` → `Profit` (+ `(?)`); for a closed trip unrealised is zero by definition, so this is the same metric |
| `src/components/portfolio/ContributionChart.tsx` | card caption `Lifetime P&L by stock` → `Profit by stock`; the `contributionStat` sentence keeps "gross gains" wording |
| `src/lib/analysis/portfolio.ts` | `contributionStat` string, any `pnl`-named field used by the UI → keep the field names, change only user-facing strings |

`grep -rn "P&L" src` must come back empty at the end of this item.

### W8.4 — What stays, and why

Two £ figures survive that are *not* profit variants. Keep both:

- **Kept vs sold** (ghost) and **money left on table** on `/decisions` — counterfactuals
  ("what the shares you sold would be worth now"), not a slice of your profit.
- **Price + dividends + FX decomposition** (stock page, and the inline bar in the holdings
  table) — this splits the one profit metric into *what drove it*, which was your own
  requirement, as opposed to splitting it by *how much is booked*, which is what you have
  just rejected. The three segments still sum exactly to Profit. Flag it if you want this
  gone too; it is a self-contained deletion (`DecompositionBar` + `computeDecomposition`).

### W8.5 — Guard the one metric with a test

`src/lib/metrics/__tests__/metrics.test.ts`, on the synthetic fixture portfolio:

```
Σ position profit  ===  Σ sells − Σ buys + Σ dividends + Σ current market value   (to 1e-9)
```

This is the invariant that makes one metric at three scopes trustworthy: the hero, the
holdings column and the contribution bars can never disagree. It holds exactly on real data
today (both sides £1,584.74) — the test locks it in.

**Acceptance:** `/` shows one profit number (the hero) plus three KPI tiles; `grep -rn "P&L"
src` is empty; the holdings Profit column sums to the hero; the test above passes.

---

## W9 — Cheap performance wins (do them, they are small)

Measured on the real DB today: `computePortfolio()` 371ms, `computeDecisions()` **2,101ms**.

1. **`computeDecisions()` calls `computePortfolio()` in full** just to read `closedTrips`,
   `winRate` and `profitFactor` — recomputing every position, every holding series and the
   whole allocation matrix. Extract the closed-trip block into
   `computeClosedTrips(instruments, allDivs, asOf)` and call that from both.
2. **O(dates × tickers × dates) scan** in `computePortfolio()`:
   ```ts
   const last = [...daily].reverse().find((x) => x.date <= date);   // per ticker, per date
   ```
   copies and reverses a ~1,900-entry array inside a double loop. Replace with one forward
   cursor per ticker advanced as `date` advances (both arrays are already sorted ascending).
3. `AllocationChart`'s per-cell `Date` construction (covered in W7).

No caching layer, no memo tables — just don't do quadratic work.

---

## W10 — Chart engine hardening ("rendering usually isn't great")

The charts do not need a new library — they need four specific defects fixed. Each was
measured in the running app; see §3 for the evidence.

### W10.1 — Charts are measured once, against the wrong box *(the big one)*

`useChartWidth()` in `src/components/portfolio/chartUtils.ts` attaches its ref to a `<div>`
that **wraps** `ChartCard`, so it measures the card's *border box* — 42px wider than the
padded content box the SVG is drawn into. And the `ResizeObserver` never delivers an update:
resizing the window from 1024px to 1500px left every SVG at its mount-time width.

Measured on `/` just now:

| Viewport | Card content box | SVG width | Result |
|---|---|---|---|
| 1024 (fresh load) | 434px | 476px | 42px spill over the padding and border |
| 1500 (after resize) | 498px | **476px** | never re-measured |
| 1900 → 1024 (resize) | 434px | **842px** | 408px of chart drawn outside the card |

That last row is the screenshot: axis labels crammed and colliding, series running past the
card edge, the right-hand end of the data cut off.

**Fix — `ChartCard` owns the measurement.** Charts should not be able to measure the wrong
element, so remove the choice:

```tsx
// src/components/charts/ChartCard.tsx
const ChartWidthContext = createContext<number | null>(null);

// inside ChartCard, around the content area (NOT the <section>):
<div ref={plotRef} className="w-full">
  <ChartWidthContext.Provider value={width}>{children}</ChartWidthContext.Provider>
</div>
```

```ts
// src/components/charts/useChartWidth.ts   (moved out of portfolio/chartUtils)
export function useMeasuredWidth(fallback = 640): [RefObject<HTMLDivElement>, number] {
  // useLayoutEffect, not useEffect — measure before paint, no first-frame flash
  // read entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
  // round, and skip setState when the change is < 1px (kills resize feedback loops)
  // seed from getBoundingClientRect() on mount, in case the observer's first
  // callback is coalesced away
}

/** Inside a ChartCard: the drawable width. Standalone: measures its own container. */
export function useChartWidth(): { ref: RefObject<HTMLDivElement>; width: number };
```

Every chart component drops its own `<div ref={ref}>` wrapper and reads the context. Charts
not inside a card (`StockChart`) keep a local `useMeasuredWidth` on their own root.

Also set `overflow-x: clip` on the card content div as a backstop, and give each chart a
sensible `minWidth` (say 280px) below which it renders the table view instead of a squashed plot.

**Acceptance:** drag the window from 1900px to 900px — every chart re-lays out continuously,
nothing crosses a card border, no horizontal scrollbar appears on the page.

### W10.2 — Tick budgeting and label collisions

`XAxis` takes a fixed `tickCount = 6`; `d3` then returns whatever round interval it likes (10
labels for your date range), each ~48px wide. At 434px of plot that is 480px of text in 434px
of space — the run-on `Apr 2024Jul 2024Oct 2024` in the screenshot.

- Budget ticks from the available width: `maxTicks = Math.max(2, Math.floor(plotWidth / (labelWidth + 24)))`,
  where `labelWidth` is a per-format constant (`"Apr 2024"` ≈ 52px at 11px, `"2024"` ≈ 26px).
  Pass that as the tick count.
- Below ~4 ticks, drop to year-only labels (`2024`) rather than dropping ticks.
- **Never clip the end labels:** the first and last tick label currently overhang the SVG by
  up to half their width. Anchor the first label `start` and the last label `end` when their
  tick sits within half a label of the plot edge.
- Same treatment for `YAxis` (`tickCount` from `plotHeight / 28`).
- One shared helper in `format.ts`; both axes and the brush use it.

### W10.3 — Mark specs that are drawn wrong

- **Scatter dot size.** PLAN.md says *area* ∝ capital deployed; the code sets
  `r = (size / maxSize) * 16`, i.e. **radius** ∝ capital, so a position with 6× the capital
  gets 36× the ink. That is the one enormous blue dot in the screenshot swallowing its
  neighbours and the reference label. Use `r = rMin + (rMax − rMin) * Math.sqrt(size / maxSize)`
  with `rMin = 4`, `rMax = 14`.
- **Scatter colour contradicts its own legend.** The legend says Open = slot-1 blue,
  Closed = muted grey; the code passes `slotVar(p.colorSlot ?? 1)` for open positions, so open
  dots come out green, orange, blue… Follow the legend: open = `var(--slot-1)`,
  closed = `var(--muted)`. (Identity colour belongs to charts where a stock *is* a series;
  here the dot's identity is in the tooltip.)
- **Reference-line label collides with the data** ("benchmark XIRR" is overprinted by a dot).
  Draw the label in a `--surface`-filled rounded rect (2px padding) and place it on whichever
  side of the line has fewer points within 40px; if the right edge is crowded, left-align it.

### W10.4 — The allocation chart is a grey soup

Bands are selected by **current weight** (`tickers` sorted by the last day's weight, then
`series.slice(0, 8)`), but colours are assigned by **lifetime peak market value**
(`assignColorSlots`). The two lists barely overlap, so most bands resolve to
`slotVar(null)` = `var(--muted)` and render identical grey — with a grey "Other" band beside
them. Verified against your DB: slots 1–8 are Vanguard S&P 500, Vanguard All-World High Div,
City of London IT, Vanguard FTSE 100, Visa, Nike, VICI, ServiceNow — while the legend on
screen lists iShares S&P 500 Hedged, elf Beauty, VG Developed Europe, Duolingo, VG Emerging
Markets and Salesforce, none of which hold a slot.

**Fix:** select the coloured bands **by colour slot**, exactly as PLAN.md specifies — the
eight slotted instruments get their own band in slot order, everything else folds into
"Other". Then the chart always shows eight distinct colours plus one grey, and a stock keeps
the same colour on every chart and every page ("colour follows the entity, never its rank").

Sort the stack so slots run 1→8 bottom-to-top with "Other" on top; do not re-sort by weight
per day, or bands will swap places over time.

### W10.5 — Crispness and proportion

- Gridlines, axis lines and baselines: add `shapeRendering="crispEdges"` and snap to
  `Math.round(y) + 0.5`. Hairlines currently land on fractional pixels and render as 2px grey
  smears at DPR 1 and blurry at DPR 2.
- Chart height is hard-coded at `H = 280` regardless of width; at 434px wide that is nearly
  square, at 900px it is a letterbox. Derive it: `height = clamp(Math.round(width * 0.42), 200, 340)`
  for the portfolio cards; the stock page's panels keep their fixed 220/64/72 split.
- `text-rendering="geometricPrecision"` on axis text; keep `tabular-nums` (already applied).

### W10.6 — Fixture coverage for the above

`/dev/charts` renders everything at one fixed width (`FIXTURE_WIDTH`), which is why none of
this was caught. Add a width switcher to that page — 360 / 480 / 720 / 1100 — that re-renders
every fixture at the chosen width, plus a "resize me" note. This is the regression test for
W10.1 and W10.2.

**Acceptance:** at 360px no axis label overlaps another or leaves its card; the scatter's
largest dot is at most ~3.5× the radius of the smallest; the allocation chart shows eight
distinct colours; gridlines are 1px sharp at DPR 1 and DPR 2.

---

## W11 — Full-screen any chart

**Why:** dense series (2,000 daily points, 20-band stacks) need width, and the two-column grid
gives each card ~430px on a laptop.

`src/components/charts/ChartCard.tsx` gains a second quiet affordance beside the existing
`table` button, same muted styling, revealed on hover/focus-within:

```tsx
<button type="button" onClick={toggleFullscreen} aria-label={`${title}: full screen`}>
  {fullscreen ? "exit" : "expand"}
</button>
```

Implementation:

- Use the **Fullscreen API** on the card element: `sectionRef.current.requestFullscreen()`,
  `document.exitFullscreen()`, and listen to `fullscreenchange` to keep state honest when the
  user presses Escape (Escape is handled by the browser — do not add a key handler).
- In fullscreen, style the section to `w-screen h-screen` with generous padding and
  `bg-page`; the chart height becomes `100vh − header − 64px` instead of the W10.5 formula.
  Pass the height down the same way width already flows (extend `ChartWidthContext` to
  `ChartSizeContext { width, height }`).
- **This works only because of W10.1** — entering fullscreen changes the container size, and
  today's charts would keep their old width. Do W10 first.
- Keyboard: the button is in the natural tab order; add `title="Full screen"`.
- Fall back gracefully where `requestFullscreen` is unavailable (Safari on iOS): render the
  card as a fixed-position overlay (`fixed inset-0 z-50`) with the same exit control.

Apply to every `ChartCard`, so the six portfolio cards, the two decisions cards and the stock
page get it uniformly. `StockChart` is not in a card — wrap it in one (title "Price · shares ·
flow", no caption) so it inherits both the measurement and the expand control, or give it the
same button locally.

**Acceptance:** clicking `expand` on any card fills the viewport with that chart, redrawn at
the new size with re-budgeted ticks (not a scaled-up bitmap); Escape returns it to the grid at
the correct size.

---

## W12 — Sweep and docs

1. **Anti-pattern pass** over all three pages against PLAN.md's design rules: no dual axes, no
   dashed lines, no recolour-on-filter, no >8 coloured series, no missing table affordance, no
   label collisions at the new default zoom levels, no skeleton flashes.
2. **Dark mode** check on every changed surface, especially the new brush track and the
   tooltip layer's shadow.
3. **Keyboard**: tab through a page — preset buttons, brush handles, trade markers, `(?)`
   buttons, sortable headers all reachable with a visible focus ring.
4. **`PLAN.md` updates** (this pass changes the spec, so the spec must change):
   - delete every rotation reference (W1),
   - metrics section: correct the averaging up/down wording to capital-weighted and
     episode-scoped (W2),
   - design rules: add "every time-axis chart carries a range brush; the range control is one
     row above the content it scopes" and drop the custom-date-input clause (W5),
   - metrics section: add the one-profit-metric rule from W8 as a **product principle** (it
     belongs next to "no misleading metrics"), and strike the "realised P&L" KPI,
   - IA section: portfolio KPI row is `current value · dividends · win rate` (W8),
   - stock page: default view is the held window, not Max (W6),
   - design rules: charts are measured from the card's content box and re-measure on resize;
     tick counts are budgeted from available width; scatter marks scale by area; the
     allocation stack's coloured bands are the eight colour-slot instruments, everything else
     is "Other"; every chart card can go full screen (W10, W11).
5. **README** — no change expected; verify the scripts table is still accurate.

---

## Acceptance checklist (walk this before calling the pass done)

- [ ] `grep -ri rotation src PLAN.md` → nothing.
- [ ] Every number on `/`, `/stocks/[ticker]`, `/decisions` is plain-labelled or has a `(?)`.
- [ ] Every `(?)` definition lives in `glossary.ts` and matches what the code computes.
- [ ] Hovering a scatter dot, a strip dot, a monthly-flow bar, a buy triangle and a sell
      triangle each shows a complete, unclipped tooltip naming the stock.
- [ ] The allocation tooltip names exactly one stock.
- [ ] All four time-axis charts have a working, draggable, keyboard-operable range brush.
- [ ] A stock page opens on the held window with post-exit context visible.
- [ ] The stock chart's three panels each have a labelled y-axis and units.
- [ ] No "net invested" metric anywhere.
- [ ] `grep -rn "P&L" src` → nothing. One profit metric, labelled "Profit", same formula at
      every scope; no realised-only, unrealised-only or closed-episodes-only variant survives.
- [ ] Holdings Profit column sums to the hero (and the test in W8.5 asserts it).
- [ ] Drag the window 1900px → 900px: every chart re-lays out live, nothing crosses a card
      border, no axis labels overlap, no page-level horizontal scrollbar.
- [ ] Allocation chart shows eight distinct colours plus grey "Other"; a stock keeps its
      colour across every chart and page.
- [ ] Scatter: largest dot ≤ ~3.5× the smallest by radius; open dots blue, closed grey, as the
      legend claims; the benchmark label is legible over dense regions.
- [ ] Every chart card has an `expand` control that fills the viewport with a re-laid-out
      chart, and Escape returns it.
- [ ] `pnpm test`, `pnpm build`, `pnpm lint` green. `/dev/charts` renders every primitive in
      both colour schemes.

## Non-goals for this pass

No new metrics — this pass removes two and corrects three. No new pages. No mobile layout. No
export. No changes to sync, the T212 client, or market-data ingestion. Do not replace the
hand-built chart layer with a library.
