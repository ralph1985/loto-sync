import Link from "next/link";

import { NumberBadge } from "@/components/ui/number-badge";
import { formatDate } from "@/features/tickets/formatters";
import type { StoredResult } from "@/features/results/data";

type RecentResultsProps = {
  results: StoredResult[];
  loading: boolean;
  error: string | null;
};

export function RecentResults({ results, loading, error }: RecentResultsProps) {
  if (loading) return <p className="text-sm text-base-content/70">Cargando resultados recientes...</p>;
  if (error) return <p className="rounded-2xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{error}</p>;
  if (results.length === 0) return <p className="text-sm text-base-content/70">No hay resultados recientes.</p>;

  return (
    <div className="space-y-4">
      {(["PRIMITIVA", "EUROMILLONES"] as const).map((game) => {
        const gameResults = results.filter((result) => result.game === game).slice(0, 3);
        if (gameResults.length === 0) return null;
        return (
          <div key={game}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-base-content">{game === "PRIMITIVA" ? "Primitiva" : "Euromillones"}</h3>
              <Link href={`/results?game=${game}`} className="text-xs font-semibold text-primary hover:underline">Ver histórico</Link>
            </div>
            <div className="grid gap-2 lg:grid-cols-3">
              {gameResults.map((result) => (
                <div key={result.id} className="rounded-2xl border border-base-300 bg-base-200/30 p-3">
                  <p className="text-xs font-semibold text-base-content/70">{formatDate(result.drawDate)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {result.numbers.map((value, index) => <NumberBadge key={`${result.id}-number-${index}`} value={value} tone="primary" />)}
                    {result.stars?.map((value, index) => <NumberBadge key={`${result.id}-star-${index}`} value={value} tone="accent" />)}
                    {result.complementario !== null && result.complementario !== undefined ? <NumberBadge value={`C ${result.complementario}`} tone="neutral" /> : null}
                    {result.reintegro !== null && result.reintegro !== undefined ? <NumberBadge value={`R ${result.reintegro}`} tone="success" /> : null}
                  </div>
                  {result.elMillionCode ? <p className="mt-2 text-xs text-base-content/70">El Millón: <span className="font-semibold text-base-content">{result.elMillionCode}</span></p> : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
