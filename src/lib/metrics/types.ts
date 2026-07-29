export type Side = 'BUY' | 'SELL';

export interface Order {
  id: string;
  t212Ticker: string;
  side: Side;
  executedAt: string; // ISO UTC
  quantity: number; // raw fill qty
  fillPriceLocal: number;
  totalGbp: number;
  feesGbp: number;
}

export interface PriceBar {
  date: string; // YYYY-MM-DD
  closeLocal: number; // major units
}

export interface DivEvent {
  date: string;
  perShareLocal: number;
}

export interface Split {
  date: string;
  numerator: number;
  denominator: number;
}

export interface DividendCash {
  id: string;
  t212Ticker: string;
  paidAt: string;
  amountGbp: number;
}

export interface FxRate {
  date: string;
  ccy: string;
  gbpPerUnit: number;
}

export interface CashFlow {
  date: string;
  amountGbp: number;
}

export interface AdjustedOrder {
  adjQty: number;
  adjPrice: number;
}

export interface DailyHolding {
  date: string;
  shares: number;
  avgCostGbp: number;
  avgFillLocal: number;
  realisedPnLGbp: number;
  marketValueGbp: number;
}

export interface ExitEvent {
  date: string;
  shares: number;
  proceedsGbp: number;
  avgPriceLocal: number;
  orderIds: string[];
}

export interface Episode {
  startDate: string;
  endDate: string | null;
  /**
   * Ids of the orders executed inside this episode, in execution order.
   * Episodes can start and end on the same calendar date, so membership is
   * decided by the share-balance walk — never by a date range.
   */
  orderIds: string[];
  exitEvents: ExitEvent[];
  isOpen: boolean;
}

export interface XirrResult {
  xirr: number | null;
  totalReturn: number;
  suppressAnnualised: boolean;
}

export interface PositionReturn {
  invested: number;
  returned: number;
  openValue: number;
  totalReturn: number;
}

export interface BuyDisciplineResult {
  ratio: number | null;
  avgFillLocal: number;
  avgCloseLocal: number;
}

export interface TrancheReturn {
  trancheId: string;
  date: string;
  classification: 'up' | 'down';
  capitalGbp: number;
  totalReturn: number;
}

export interface TrancheClass {
  count: number;
  capitalGbp: number;
  totalReturn: number;
}

export interface WorstPoint {
  date: string;
  drawdown: number;
}

export interface PostExitHorizon {
  horizonDays: number;
  label: string;
  rawReturn: number;
  adjustedReturn: number;
}

export interface PostExitResult {
  exitEvent: ExitEvent;
  horizons: PostExitHorizon[];
}

export interface GhostResult {
  ghostValueGbp: number;
  actualProceedsGbp: number;
  deltaGbp: number;
  deltaPct: number;
}

export interface Decomposition {
  priceGbp: number;
  dividendsGbp: number;
  fxGbp: number;
  totalGbp: number;
}

export interface TwrPoint {
  date: string;
  index: number;
  dailyReturn: number;
}

export interface ReplayResult {
  replayXirr: number | null;
  replayTotalReturn: number;
  pickingEdge: number | null;
  suppressAnnualised: boolean;
}

export interface AllocationDay {
  date: string;
  weights: Record<string, number>;
  top3Concentration: number;
}
