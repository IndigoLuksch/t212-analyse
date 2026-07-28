export interface MetricDef {
  /** Tooltip heading — matches the on-screen label. */
  label: string;
  /** One sentence: what it measures AND how it's computed. No jargon left undefined. */
  definition: string;
}

export const METRICS = {
  profit: {
    label: "Profit",
    definition:
      "Money out plus what you still hold, minus money in — net of fees, in GBP, with dividends counted as cash received.",
  },
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
  pickingEdge: {
    label: "Picking edge",
    definition:
      "What the same money, moved on the same days, would have earned in a world tracker.",
  },
  dividendsReceived: {
    label: "Dividends",
    definition:
      "Cash dividends credited to the account in GBP, summed over the scope shown.",
  },
  netCashIn: {
    label: "Net cash in",
    definition:
      "Cumulative buys minus sell proceeds, including fees — the money currently committed to positions.",
  },
  twr: {
    label: "TWR",
    definition:
      "Time-weighted return of the portfolio, compounded daily and indexed to 100 at the start of the window — strips out the timing of deposits and withdrawals.",
  },
  benchmark: {
    label: "Benchmark",
    definition:
      "The same TWR calculation on an All-World tracker, for the same dates — a line to compare against, not a claim you could have bought it frictionlessly.",
  },
  allocationWeight: {
    label: "Allocation weight",
    definition:
      "Each stock's market value as a share of total portfolio value on that day, in GBP.",
  },
  dotArea: {
    label: "Dot area",
    definition: "Dot area is capital deployed — larger dots put more money at risk.",
  },
  benchmarkXirr: {
    label: "Benchmark XIRR",
    definition:
      "The All-World tracker's annualised return over the same calendar span as the chart — a horizontal reference, not a per-stock number.",
  },
  avgCost: {
    label: "Avg cost",
    definition:
      "Share-weighted average fill price in the stock's trading currency, on the current (split-adjusted) basis.",
  },
  weight: {
    label: "Weight",
    definition:
      "This position's current market value divided by total open portfolio value.",
  },
  decomposition: {
    label: "Decomposition",
    definition:
      "How profit splits into local price move, dividends received, and FX — the three segments always sum exactly to profit; FX is the residual after price and dividends.",
  },
  buyDiscipline: {
    label: "Buy discipline",
    definition:
      "Your value-weighted average buy price ÷ the stock's average daily close between your first and last buy. Below 1.00× means your staggered buying beat buying the same amount on a fixed schedule. Shown as – when you accumulated in under 7 days.",
  },
  worstPoint: {
    label: "Worst point",
    definition:
      "The deepest drawdown of market value versus money still in the position while you held it, in GBP terms.",
  },
  postExitRaw: {
    label: "Raw post-exit",
    definition:
      "The stock's GBP total return (price × FX, plus dividends) from the sale date to each horizon — how it moved after you sold, with no market adjustment.",
  },
  postExitAdjusted: {
    label: "Adj post-exit",
    definition:
      "Raw post-exit return minus the benchmark's GBP return over the same window — only the difference measures timing in a rising market.",
  },
  keptVsSold: {
    label: "Kept vs sold",
    definition:
      "What the shares you sold would be worth today (plus dividends they would have paid) minus the proceeds you actually received.",
  },
  medianAdj6m: {
    label: "Median adj. 6m",
    definition:
      "Median index-adjusted return 6 months after each exit.",
  },
  averagingDown: {
    label: "Averaging down",
    definition:
      "Every buy you made below your running average cost, weighted by the money you put in: what that money returned in GBP from the buy date to the position's exit (or today if still open). The tranche count beside it is how many such buys there were.",
  },
  averagingUp: {
    label: "Averaging up",
    definition:
      "Every buy you made above your running average cost, weighted by the money you put in: what that money returned in GBP from the buy date to the position's exit (or today if still open). The tranche count beside it is how many such buys there were.",
  },
  moneyLeftOnTable: {
    label: "Money left on table",
    definition:
      "Sum of kept-vs-sold deltas across all exits — positive means you left money on the table.",
  },
  winRate: {
    label: "Win rate",
    definition:
      "Share of closed round trips with positive profit.",
  },
  profitFactor: {
    label: "Profit factor",
    definition:
      "Gross profits divided by gross losses across closed round trips.",
  },
} as const satisfies Record<string, MetricDef>;

export type MetricId = keyof typeof METRICS;
