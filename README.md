# t212-analyse

Local-first dashboard for your Trading 212 accounts: portfolio history, per-stock trade quality, and honest performance metrics. Runs on localhost only — trade data never leaves the machine.

See [PLAN.md](./PLAN.md) for product principles, metrics definitions, and design rules.

## Setup

```bash
pnpm install
cp .env.local.example .env.local   # add one API key pair per account
pnpm seed                          # optional offline fixtures
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Click the sync pill in the header to pull live T212 history and market data (first sync can take several minutes due to rate limits).

## Accounts

A Trading 212 API key only ever reads the account it was generated under, so each account needs its own pair:

```
T212_ACCOUNTS=isa,invest
T212_ISA_API_KEY=…       T212_ISA_API_SECRET=…
T212_INVEST_API_KEY=…    T212_INVEST_API_SECRET=…
```

Every view pools the accounts into one portfolio — holdings, returns and trade quality are computed as if it were a single account. The names in `T212_ACCOUNTS` are stored on each synced row as provenance only, and nothing in the UI splits on them. Omit `T212_ACCOUNTS` and set a bare `T212_API_KEY`/`T212_API_SECRET` pair to sync a single account.

The accounts must share a base currency (all monetary columns are stored in it), and a name must keep pointing at the same T212 account: sync aborts with an explanation if a name's credentials move, or if two names resolve to the same account, rather than silently double-counting.

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build |
| `pnpm test` | Metrics library Vitest suite |
| `pnpm seed` | Load synthetic SQLite fixtures for offline UI work |

## Stack

Next.js (App Router) · TypeScript · Tailwind v4 · SQLite (`better-sqlite3`) · hand-built SVG charts (`d3-scale` / `d3-shape` / `d3-array`) · yahoo-finance2 · frankfurter.app FX
