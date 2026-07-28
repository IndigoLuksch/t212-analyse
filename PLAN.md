# t212-analyse — implementation plan

A local-first web dashboard that analyses one Trading 212 account: portfolio history, per-stock trade quality, and honest performance metrics. Single user, runs on localhost, no auth, no cloud. Trade data never leaves the machine.

The owner is a research-driven stock picker: fewer than ~40 positions ever, accumulates gradually, exits fast. The app answers two questions plain P&L can't: **"what did each position earn per year of holding?"** and **"were my sells (and the redeployments after them) good decisions?"**

## Product principles (enforce throughout)

1. **No misleading metrics.** Never annualise a holding period under 182 days — show total return and an en-dash for the annualised figure. No Sharpe, beta, volatility, technical indicators, or risk scores anywhere.
2. **Every metric is self-explanatory.** Any non-obvious number gets a plain-English definition in its hover tooltip (what it measures + how computed, one sentence). No jargon left undefined.
3. **Minimal UI.** No unnecessary words, buttons, borders, or decoration. If an element doesn't change a decision, it doesn't ship. Sentences over widgets where a sentence is clearer.
4. **All returns are experienced returns**: computed in GBP (the account currency), net of actual fees, stamp duty and FX charges, including dividends. Price *charts* stay in the stock's trading currency (the prices the owner recognises); *metrics* are GBP. Label both clearly once per page, not per number.
5. **Benchmark honesty.** Comparisons vs FTSE All-World use the *same-cashflow replay* method (defined below), not naive overlays. Default benchmark: FTSE All-World accumulating (Yahoo `VWRP.L`); switchable constant in one config file.

---

## Stack

- **Next.js 15+ (App Router) + TypeScript strict.** Server components/route handlers do all external fetching; SQLite via **better-sqlite3** at `data/app.db` (gitignore `data/` and `.env.local`; `git init` in phase 0 if not a repo).
- **Tailwind v4** with the design tokens in this file as CSS custom properties. Font: `system-ui, -apple-system, "Segoe UI", sans-serif` — no webfonts, no display faces.
- **Charts: hand-built React SVG components** using only `d3-scale`, `d3-shape`, `d3-array` as math helpers. No charting library (they leak their own look; the spec below is exact). One shared primitives kit (phase 4) reused by every chart.
- **Zod** to parse external API responses (`.passthrough()` — store raw JSON alongside normalised columns; both T212 and Yahoo drift).
- **Vitest** for the metrics library (pure functions, golden-number fixtures).
- Market data: **yahoo-finance2** (daily closes, splits, dividend events, ISIN search). FX: **frankfurter.app** (ECB daily rates, no key).

## Data sources

### Trading 212 API (verified working)

Base URL `https://live.trading212.com` (override `T212_BASE_URL`). **Basic auth**: API key as username, secret as password, from `.env.local` (`.env.local.example` documents it). Accounts are GBP — but read the base currency from the API, don't hardcode.

**Multi-account.** A T212 key reads only the account it was generated under, so each account carries its own pair: `T212_ACCOUNTS=isa,invest` plus `T212_<NAME>_API_KEY`/`_API_SECRET` (a bare `T212_API_KEY` pair still works as a single account named `default`). Sync walks the accounts in order, sharing one global request queue, and stamps each row's `account_id` with the config name. **Everything downstream pools the accounts into one portfolio** — no read path filters on `account_id`, and no view splits by account. Guards, checked before any row is written: two names resolving to the same T212 account id, a name whose credentials have moved to a different account since its last sync (both would corrupt history silently), and accounts with differing base currencies.

| Endpoint | Purpose |
|---|---|
| `GET /api/v0/equity/account/info` | `{id, currencyCode}` — base currency |
| `GET /api/v0/equity/portfolio` | current open positions — used to **reconcile** computed holdings |
| `GET /api/v0/equity/metadata/instruments` | full instrument catalogue: T212 ticker, ISIN, currency, name |
| `GET /api/v0/equity/history/orders?cursor=&limit=50` | all historical orders (cursor-paginated) |
| `GET /api/v0/history/dividends?cursor=&limit=50` | dividends received |
| `GET /api/v0/history/transactions?cursor=&limit=50` | deposits/withdrawals/interest — ingest and store for future use, unused in v1 UI |

Implementation notes:
- **Rate limits are strict and per-endpoint** (some allow ~1 request / 5–30 s). Build one global request queue: minimum 2 s spacing, honor `429` `Retry-After` with backoff, persist pagination cursors in `sync_state` so an interrupted first sync resumes. First full sync may take minutes — stream progress to the UI (see Sync UX).
- Keep only **filled** orders. Normalise per order: side, executed-at (UTC), filled quantity, fill price (instrument currency), total in GBP, and the sum of all fee/tax fields (T212 reports FX fees, stamp duty etc. per order and/or in history rows — sum everything attributable into `fees_gbp`). If a GBP total field is absent for some order type, reconstruct it as `qty × fillPrice × fx(date)` and mark it derived.
- Sync is **incremental and idempotent**: upsert by T212 order/transaction id. Ids are safe to share one key space across accounts — order ids are a global integer sequence, dividend/transaction references are UUIDs. Pagination cursors are namespaced per account (`t212_orders_cursor:isa`).

### Market data

- Daily bars via yahoo-finance2 `chart()` with `events: 'div|split'`. Use the **split-adjusted `close`** (not `adjclose`) — dividends are handled explicitly as cashflows, never double-counted via adjusted prices.
- **Symbol mapping** T212 → Yahoo: T212 tickers look like `AAPL_US_EQ`, `BARC_GB_EQ`. Heuristics: US → bare symbol (`AAPL`); GB/LSE → `SYM.L`; DE → `.DE`; NL → `.AS`; FR → `.PA`; etc. Validate each mapping by fetching quote metadata and checking the **currency matches the instrument's** T212 currency. On failure, fall back to `search(ISIN)`. Persist mapping in `instruments.yahoo_symbol`; a `yahoo_override` column + a tiny inline fix-up UI (only shown when a mapping failed) is the escape hatch.
- **The pence trap (critical):** LSE instruments quote in **GBp (pence)** — Yahoo metadata `currency === "GBp"`. Divide prices *and* per-share dividend events by 100 to get GBP. Store everything in major units with the currency recorded. Same for `VWRP.L`.
- Cache all bars/events in SQLite; refresh = fetch from last cached date. Delisted/unmappable instruments: keep last known price, flag the position "stale price" in the UI (muted badge), never silently extrapolate.
- FX daily rates from frankfurter.app (EUR base) → derive `gbp_per_unit(ccy, date)`; forward-fill weekends/holidays. Convert local→GBP as `value × gbp_per_unit`.

### SQLite schema

```sql
instruments(t212_ticker TEXT PK, isin TEXT, name TEXT, currency TEXT,
            yahoo_symbol TEXT, yahoo_override TEXT, color_slot INTEGER, raw JSON);
-- account_id = T212_ACCOUNTS name the row came from; provenance only, never filtered on
orders(id TEXT PK, account_id TEXT NOT NULL DEFAULT '',
       t212_ticker TEXT, side TEXT CHECK(side IN ('BUY','SELL')),
       executed_at TEXT, quantity REAL, fill_price_local REAL,
       total_gbp REAL, fees_gbp REAL, gbp_derived INTEGER DEFAULT 0, raw JSON);
dividends(id TEXT PK, account_id TEXT NOT NULL DEFAULT '', t212_ticker TEXT,
          paid_at TEXT, amount_gbp REAL, raw JSON);
transactions(id TEXT PK, account_id TEXT NOT NULL DEFAULT '', type TEXT,
             occurred_at TEXT, amount_gbp REAL, raw JSON);
prices(yahoo_symbol TEXT, date TEXT, close_local REAL, PRIMARY KEY(yahoo_symbol, date));
div_events(yahoo_symbol TEXT, date TEXT, per_share_local REAL, PRIMARY KEY(yahoo_symbol, date));
splits(yahoo_symbol TEXT, date TEXT, numerator REAL, denominator REAL, PRIMARY KEY(yahoo_symbol, date));
fx(date TEXT, ccy TEXT, gbp_per_unit REAL, PRIMARY KEY(date, ccy));
notes(order_id TEXT PK, text TEXT, updated_at TEXT);  -- decision journal
sync_state(key TEXT PK, value TEXT);
```

Data volumes are tiny (thousands of orders, ~40 instruments × ~2,500 daily bars). Load into memory per request and compute with pure functions — no materialised metric tables, no caching layer beyond SQLite itself.

---

## Metrics library (`lib/metrics/` — pure, unit-tested, no I/O)

All functions take plain arrays (orders, prices, fx, dividends) and return plain objects. Dates are UTC calendar dates; an order's date is the UTC date of execution. Test every function against hand-computed golden fixtures (see Testing).

**Split adjustment.** Express everything in *current* share basis: for each order, `adjQty = qty × Π ratio(s)` over splits `s` with `s.date > order.date` (ratio = numerator/denominator), `adjPrice = fill_price / same factor`. Yahoo `close` is already in current basis, so adjusted holdings × close is consistent by construction.

**Daily holdings & cost basis.** `shares(t)` = cumulative adjusted qty. Moving-average cost basis in GBP: buys add `total_gbp + fees_gbp`; sells remove `soldQty × avgCost` and book realised P&L. Also track local-currency average fill price (for the chart's cost line). Fractional-dust rule: shares below `max(1e-6, 1e-4 × episode peak)` count as zero (T212 fractional residue).

**Episodes & exit events.** An *episode* (round trip) is a maximal span where `shares > 0`, split at zero-crossings; the last may be open. Within an episode, consecutive sells with gaps **< 7 days** merge into one **exit event** (one decision): value-weighted price and date, summed shares/proceeds. All sell-quality analytics operate on exit events, full or partial.

**Position return (GBP, experienced).** `invested = Σ buy totals + fees`; `returned = Σ sell proceeds + Σ dividends`; open value = `shares × close × fx` today. Total return = `(returned + value − invested) / invested`.

**XIRR** — money-weighted annual return: the constant yearly rate discounting all GBP flows (buys −, sells +, dividends +, terminal value + if open) to zero NPV, exponent `(tᵢ−t₀)/365.25`. Bracket then bisect on `[−0.9999, 100]`, Newton polish; total-loss edge → −100%. **Display rule:** span < 182 days ⇒ UI shows total return and an en-dash for XIRR (tooltip: "held under 6 months — annualising would overstate"). This rule applies *everywhere* XIRR appears.

**Post-exit performance** (per exit event): stock's GBP **total return** (price × FX, plus per-share dividends) from exit date to horizons +21/63/126/252 trading days (label 1m/3m/6m/12m; omit horizons still in the future), shown **raw** and **index-adjusted** = raw − benchmark GBP total return over the same window. Tooltip definition: "how the stock moved after this sale, minus how the index moved — in a rising market everything goes up after you sell; only the difference measures timing."

**Ghost (kept-vs-sold), per stock.** For each exit event: `ghostToday = soldShares(current basis) × close_today × fx_today + dividends those shares would have received since`. Delta vs actual proceeds, £ and %. The only aggregate is one labelled sum on the Decisions page: "total across all exits — ignores what the proceeds did next."

**Buy discipline** (per position): value-weighted average local fill price ÷ time-average close over `[first buy, last buy]`. Window < 7 days ⇒ "—". Tooltip: "your average cost vs the stock's average price while you were accumulating — below 1.0 means your staggered buying beat a mechanical schedule."

**Averaging up vs down.** Every buy after an episode's first is a tranche, classed by fill price vs the running average cost at execution (below = averaging down). Per class: capital-weighted GBP total return from tranche date to episode end (or today). Always show tranche counts beside the two numbers — no significance theatre.

**Worst point while held** (per episode): `min over t of (marketValue_gbp(t) / netInvested_gbp(t) − 1)` while shares > 0, with its date. "The deepest this position sat below your money in."

**Return decomposition — price + dividends + FX** (per position and portfolio): three GBP amounts summing exactly to total P&L. Price = local-currency value change converted at *entry* FX rates (per-tranche); dividends = GBP dividends received (+ accrued ghost dividends excluded); FX = residual (includes the cross term — state this convention in the tooltip). Render as a signed three-segment horizontal bar.

**Portfolio TWR** — time-weighted return, the growth of £1 ignoring deposit timing: daily `r_t = (V_t + sells_t + divs_t − buys_t − V_{t−1}) / V_{t−1}` over securities value only, chain-linked, skip days with `V_{t−1} = 0`. Plot indexed to 100 alongside the benchmark indexed at the same start date. **One axis.**

**Same-cashflow benchmark replay** — the headline honesty number: replay every GBP flow into `VWRP.L` (accumulating, so dividends are inside the price) at that day's close; XIRR of the replayed flows. **Picking edge = actual XIRR − replay XIRR** (per position and portfolio-wide). Tooltip: "what the same money, moved on the same days, would have earned in a world tracker." If VWRP history doesn't cover the earliest trades, splice `VWRL.L` + reinvested dividends before VWRP inception.

**Allocation over time**: daily `weight_i = MV_i / ΣMV` (securities only). Also top-3 concentration = sum of the three largest weights each day.

---

## Design system (exact tokens — implement as CSS custom properties, light + dark)

Dark mode follows `prefers-color-scheme` only — no toggle. All hexes below are final; do not restyle.

**Chrome & ink**

| Role | Light | Dark |
|---|---|---|
| Page plane | `#f9f9f7` | `#0d0d0d` |
| Card / chart surface | `#fcfcfb` | `#1a1a19` |
| Primary ink | `#0b0b0b` | `#ffffff` |
| Secondary ink | `#52514e` | `#c3c2b7` |
| Muted (axis, labels) | `#898781` | `#898781` |
| Gridline (hairline) | `#e1e0d9` | `#2c2c2a` |
| Baseline / axis | `#c3c2b7` | `#383835` |
| Positive delta text | `#006300` | `#0ca30c` |
| Hairline border | `rgba(11,11,11,.10)` | `rgba(255,255,255,.10)` |

**Categorical series slots** (identity of stocks; assign in this fixed order)

| Slot | Light | Dark | | Slot | Light | Dark |
|---|---|---|---|---|---|---|
| 1 blue | `#2a78d6` | `#3987e5` | | 5 magenta | `#e87ba4` | `#d55181` |
| 2 orange | `#eb6834` | `#d95926` | | 6 green | `#008300` | `#008300` |
| 3 aqua | `#1baf7a` | `#199e70` | | 7 violet | `#4a3aa7` | `#9085e9` |
| 4 yellow | `#eda100` | `#c98500` | | 8 red | `#e34948` | `#e66767` |

**Polarity (diverging) pair**: blue `#2a78d6`/`#3987e5` ↔ red `#e34948`/`#e66767`, neutral gray midpoint `#f0efec`/`#383835`. Used for buy↔sell, gain↔loss, and "avoided loss ↔ left money on table". Never use the categorical palette for polarity, and never use status-style green/red text colors as chart fills.

**Rules (non-negotiable, from the design method):**
- **One y-axis per plot. Never dual-axis.** Different-scale series → stacked panels sharing the x-axis, or index both to 100.
- Lines 2px round-capped; markers ≥ 8px with a **2px surface-color ring**; area fills at ~10% opacity; bars ≤ 24px thick, 4px rounded at the data end, square at the baseline; adjacent/stacked fills separated by a **2px surface gap**, never a stroke.
- Gridlines: solid hairlines one step off the surface, few of them. No dashed lines anywhere (dashing implies projection).
- **Color follows the entity, never its rank.** Each stock gets a permanent slot (assignment below); filtering never recolors survivors.
- Stock → slot assignment: rank instruments by lifetime peak market value; top 8 take slots 1–8 in that order (persist in `instruments.color_slot`); all others render in muted `#898781` and fold into "Other" where stacking. Max 8 colored series on any chart.
- **Text never wears a series color.** Values, labels, legends, axis text use ink tokens; identity comes from a small colored mark beside the text. Positive/negative *text* deltas use the positive-delta green / a `#d03b3b`-family red, with an explicit +/− sign always.
- Legends present for ≥ 2 series; a single series needs none (the title names it). Direct-label selectively — endpoints and extremes only, never every point.
- **Every chart has a crosshair or per-mark hover with one tooltip listing all series at that x** (value first and bold, series name second, keyed by a short color stroke). Hit targets ≥ 24px (scatter uses nearest-point). Insert all API-derived strings with `textContent`, never `innerHTML`.
- Tooltips never gate: every chart card has a quiet "table" affordance (muted text button, visible on hover/focus-within) flipping the card to an equivalent HTML table.
- Refetch/sync holds the previous render at reduced opacity — no skeletons, no layout jumps.
- Filters (time-range presets) live in **one row above the content they scope**, never inside a chart card. Presets: 1Y · 3Y · 5Y · Max (default Max), custom range tucked behind a hairline divider.
- Numbers: GBP as `£1,234` / compact `£12.4k`; percentages 1 d.p. with explicit sign for deltas; `font-variant-numeric: tabular-nums` **only** in tables and axis ticks; large standalone numbers use proportional figures; missing/suppressed = en-dash.

---

## Information architecture

Three routes + chrome. Header: wordmark "t212‑analyse" (plain text), nav **Portfolio · Decisions**, a ⌘K stock switcher (fuzzy over name/ticker), and a sync pill.

**Sync UX:** pill shows "synced 2h ago"; click = sync now; during sync it shows phase + counts ("orders 340/～", "prices 12/31") streamed via SSE or polling; charts stay rendered at reduced opacity. First-run empty state: one sentence + a single Sync button, centred.

### 1. `/` — Portfolio

Top: **hero figure** — total P&L since inception in £ (one ≥48px number) with, beneath it in one quiet line: total return %, XIRR, and **picking edge** ("+2.1%/yr vs All-World replay", tooltip-defined, green/red text by sign). KPI stat tiles in one row: current value · invested (net) · realised P&L · dividends received · win rate on closed round trips.

Cards, in order (2-col grid on wide screens, generous whitespace):
1. **Value vs invested** — area (10% wash, slot 1) of daily portfolio value with a step line for cumulative net invested cash; 2 series, legend + end labels.
2. **Performance vs benchmark** — actual TWR and benchmark TWR, both indexed to 100 at first trade date, one axis, end-labeled.
3. **Allocation over time** — 100% stacked area of daily weights, top-8 colored + gray "Other"; 2px surface-color boundaries between bands; hover isolates a band (others fade to ~25%) and the tooltip lists all weights at that date; **click a band → that stock's page**. Quiet toggle: `%` / `£` (absolute stacked). Optional thin overlay: top-3 concentration line (same % axis — no second scale), off by default behind the same toggle row.
4. **Hold time × annual return scatter** — one dot per position with span ≥ 182 days (caption: "n short holds excluded — too brief to annualise"); x = years held, y = XIRR, dot area ∝ capital deployed, open = slot-1 blue, closed = muted gray (legend). Hairline reference at the portfolio's replay-benchmark XIRR, labeled. Direct-label the extremes only; nearest-point hover names the rest.
5. **Contribution** — horizontal diverging bars: lifetime GBP P&L per stock (realised + unrealised + dividends − fees), sorted, positive blue / negative red, value at each bar end, one-line stat beneath: "3 of 24 picks produced 78% of gross gains."
6. **Holdings table** — open positions: name, shares, avg cost, value, weight, P&L £/%, XIRR (or –), price+div+FX decomposition as a tiny inline 3-segment bar, "stale price" badge where applicable. Rows link to stock pages. Sortable, `tabular-nums`.

### 2. `/stocks/[ticker]` — Stock page (the hard requirement)

Header: name, ticker · exchange · currency note ("chart in USD · metrics in GBP"), then one row of stat chips: value (or "closed"), shares, GBP P&L incl. dividends (£ and %), XIRR or total-return, hold time, buy discipline, worst point while held, dividends received.

**Main chart — three stacked panels, one shared x-axis, one synced crosshair, one tooltip.** Time-range preset row above.

- **P1 · Price** (tallest): 2px slot-1 line of daily close in local currency; running average-cost line in secondary-ink gray (2px, solid), labeled "avg cost" at its end. Buy/sell markers on the price line at execution dates: up-triangles (polarity blue) for buys, down-triangles (polarity red) for sells, area ∝ trade value, ≥ 8px, 2px surface ring, ≥ 24px hit targets. Marker tooltip: date, qty @ price, GBP total, the tranche's own return-to-date (buys), or the exit event's post-1/3/6/12m raw & adjusted numbers (sells), plus the journal note if present. Dividend events: small dots pinned to the baseline. **After the final exit the price line continues at ~35% opacity** — the post-mortem drawn on the chart — with a single quiet annotation at today's end: "kept: £X (+Y% vs sold)".
- **P2 · Shares held** (~64px): step area, slot-1 at 10% opacity with 2px top edge, own minimal y-axis (0 → max).
- **P3 · Monthly net flow** (~72px): columns of net GBP bought (up, blue) / sold (down, red) per month from a zero baseline, ≤ 24px wide, 4px rounded data-ends, 2px gaps — the buying/selling-rate view.

Below the chart:
- **Exits** (if any): one row per exit event — date, shares sold, proceeds; the four horizon returns as signed values with small ▲▼ polarity glyphs (raw and, emphasised, index-adjusted); "kept vs sold" £/%. Inline journal note per event and per buy tranche: single-line click-to-edit text field, muted placeholder "note your thinking…", autosaved to `notes`.
- **Decomposition**: the three-segment price+dividends+FX bar with the three GBP values labeled.

### 3. `/decisions` — Decisions

The trade-quality review. KPI row of stat tiles, each tooltip-defined: median index-adjusted 6m post-sell move · averaging down vs up (two returns + counts) · median buy discipline · money left on table (the labelled ghost aggregate).

1. **Sell timing strip** — one dot per exit event on a horizontal axis of index-adjusted 6m post-exit return; zero hairline; left of zero blue ("exited well"), right red ("left money"); nearest-point hover names stock/date/detail; median marked. Direct-label the two extremes.
2. **Exit table** — every exit event: stock, date, proceeds, raw & adjusted +6m, kept-vs-sold, journal note. Sortable.
3. **Closed round trips table** — stock, entry→exit dates, hold, invested, P&L £/%, XIRR (or –), worst point, buy discipline, note. Footer line: win rate (% of round trips profitable) and profit factor (gross profits ÷ gross losses), each tooltip-defined.

---

## Phases (each ends green: `pnpm test` + `pnpm build`)

- **P0 scaffold** — Next+TS+Tailwind+SQLite+Vitest wiring, tokens as CSS vars (light+dark), migrations runner, env loading, `git init` + `.gitignore` (`data/`, `.env.local`, `node_modules/`). Done when: empty shell renders with header/nav in both modes.
- **P1 T212 sync** — client with queue/backoff, instruments + orders + dividends + transactions ingestion, cursor persistence, sync route + progress UX. Done when: counts match the account's history in the T212 app; re-sync is a no-op.
- **P2 market data** — Yahoo mapping (heuristics + ISIN search + override UI stub), price/split/div ingestion, GBp→GBP handling, FX ingestion, reconciliation check (computed holdings vs `/equity/portfolio` quantities; surface mismatches in a dev-only banner). Done when: every held instrument has a validated symbol and current-basis holdings match T212.
- **P3 metrics library** — everything in the Metrics section as pure functions with golden-fixture tests: XIRR (standard case, sign-flip, total loss, <182d suppression flag), split adjustment, episode/exit-event grouping incl. dust rule, pence conversion, decomposition summing exactly, replay, TWR. Done when: tests green with hand-verified numbers.
- **P4 chart primitives** — `<ChartCard>` (title, table-flip affordance), scales/axes (clean ticks, hairlines), synced-panel container, crosshair + single tooltip, marker/band/column/strip/scatter/stacked-area/diverging-bar marks per the mark specs, time-preset row, number formatters. Done when: a storybook-style `/dev/charts` page renders each primitive with fixture data, both modes.
- **P5 stock page** · **P6 portfolio page** · **P7 decisions page + journal** — assemble from P3+P4. Each done when: the page matches this spec against real synced data.
- **P8 polish** — sweep every view against the anti-pattern list implied by the design rules (dual axes, recolor-on-filter, label collisions/clipping, missing table views, missing tooltips, skeleton flashes, dashed lines, >8 colored series); dark-mode audit; keyboard focus states; empty/error states (one quiet sentence each); delete dead UI.

**Testing note:** build synthetic fixtures (a fake instrument with a 2:1 split, staggered buys, a partial exit, dividends, a USD instrument with moving FX) and assert exact metric outputs computed by hand in the fixture file's comments. Add a `data/seed.ts` that loads fixtures into SQLite so all UI is developable offline; never hit live APIs in tests.

## Non-goals (v1)

No auth/multi-user. No deployment (localhost only). No intraday/realtime data. No CSV import. No cash-balance tracking or cash-drag analytics. No technical indicators, Sharpe/beta/volatility, or risk scores. No dividend-income dashboard (dividends live inside returns and the decomposition). No mobile layout (desktop + tablet responsive only).

**Future work (documented, not built):** a CGT/Section-104 realised-gains view — this is the one place accounts must *stop* being pooled, since it applies only to the taxable Invest account, not the ISA (`account_id` is already recorded for it); CSV-export import as offline fallback; cash & interest tracking from `transactions`.
