import Link from "next/link";
import { listPies } from "@/lib/analysis/pies";
import { formatGbp, formatPct } from "@/lib/format/numbers";

export default function PiesPage() {
  const pies = listPies();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Pies</h1>
        <p className="mt-1 text-sm text-muted">
          Reconstructed from order history — T212 reports pies as a live snapshot only
        </p>
      </header>

      {pies.length === 0 ? (
        <p className="text-sm text-muted">
          No pies found. Run a sync to fetch them.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {pies.map((p) => (
            <Link
              key={p.id}
              href={`/pies/${p.id}`}
              className="rounded-lg border border-border p-4 hover:bg-page"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] text-ink">{p.name}</span>
                <span className="text-xs text-muted">{p.accountId}</span>
              </div>
              <div className="mt-2 text-2xl text-ink tabular">
                {formatGbp(p.valueGbp ?? 0)}
              </div>
              <div className="mt-1 text-sm text-muted tabular">
                {p.resultCoef != null && (
                  <span
                    className={p.resultCoef >= 0 ? "text-positive" : "text-negative"}
                  >
                    {p.annualisedReturn != null
                      ? `${formatPct(p.annualisedReturn, { signed: true })}/yr`
                      : formatPct(p.resultCoef, { signed: true })}
                  </span>
                )}
                {" · "}
                {p.constituentCount} holdings
                {p.createdAt && ` · since ${p.createdAt}`}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
