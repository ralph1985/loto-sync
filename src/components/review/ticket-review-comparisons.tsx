import { formatPrice } from "@/features/tickets/formatters";
import { formatDrawChip, toNumberArray } from "@/features/tickets/review-utils";
import type { DrawType, Ticket, TicketCheck } from "@/features/tickets/types";

type TicketReviewComparisonsProps = {
  ticket: Ticket;
  checks: TicketCheck[];
  mainNumbers: number[];
  stars: number[];
  reintegro: number | null;
  expanded: boolean;
  onToggle: () => void;
};

export function TicketReviewComparisons({
  ticket,
  checks,
  mainNumbers,
  stars,
  reintegro,
  expanded,
  onToggle,
}: TicketReviewComparisonsProps) {
  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
      <button
        type="button"
        onClick={onToggle}
        className="mb-2 flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50"
      >
        <span className="min-w-0 break-words text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Comparativas semanales ({checks.length})
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500">
          {expanded ? "Plegar" : "Desplegar"}
          <span
            className={`inline-block transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            ▾
          </span>
        </span>
      </button>

      {expanded && checks.length > 0 ? (
        <div className="space-y-2">
          {checks.map((check) => {
            const winningMain = toNumberArray(check.winningNumbers);
            const winningStars = toNumberArray(check.winningStars);
            const reintegroHit =
              reintegro !== null &&
              check.winningReintegro !== null &&
              reintegro === check.winningReintegro;

            return (
              <div
                key={`${ticket.id}-cmp-${check.id}`}
                className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  <span>{formatDrawChip(check.drawDate)}</span>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">
                    {check.matchesMain}
                    {check.matchesStars ? ` + ${check.matchesStars}*` : ""}
                  </span>
                  {(check.prizeCents ?? 0) > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                      {formatPrice(check.prizeCents)}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <ComparisonNumbers
                    label="Apostado"
                    mainNumbers={mainNumbers}
                    stars={stars}
                    reintegro={reintegro}
                    drawType={ticket.draw?.type}
                    winningMain={winningMain}
                    winningStars={winningStars}
                    reintegroHit={reintegroHit}
                  />
                  <ComparisonNumbers
                    label="Resultado"
                    mainNumbers={winningMain}
                    stars={winningStars}
                    reintegro={check.winningReintegro ?? null}
                    drawType={ticket.draw?.type}
                    winningMain={mainNumbers}
                    winningStars={stars}
                    reintegroHit={reintegroHit}
                    emptyLabel="Sin resultado cargado"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : expanded ? (
        <p className="text-xs text-slate-500">Sin comprobaciones todavía.</p>
      ) : null}
    </div>
  );
}

type ComparisonNumbersProps = {
  label: string;
  mainNumbers: number[];
  stars: number[];
  reintegro: number | null;
  drawType?: DrawType;
  winningMain: number[];
  winningStars: number[];
  reintegroHit: boolean;
  emptyLabel?: string;
};

function ComparisonNumbers({
  label,
  mainNumbers,
  stars,
  reintegro,
  drawType,
  winningMain,
  winningStars,
  reintegroHit,
  emptyLabel,
}: ComparisonNumbersProps) {
  const isBet = label === "Apostado";

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-1 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-x-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {mainNumbers.length > 0 ? (
          mainNumbers.map((value, index) => {
            const hit = winningMain.includes(value);
            return (
              <span
                key={`${label}-main-${index}-${value}`}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  hit
                    ? "bg-emerald-500 text-white"
                    : isBet
                    ? "bg-slate-800 text-white"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {value}
              </span>
            );
          })
        ) : (
          <span className="text-xs text-slate-400">{emptyLabel}</span>
        )}
        {stars.map((value, index) => {
          const hit = winningStars.includes(value);
          return (
            <span
              key={`${label}-star-${index}-${value}`}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                hit
                  ? "bg-emerald-200 text-emerald-900"
                  : isBet
                  ? "bg-[#f9c784] text-slate-900"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {value}
            </span>
          );
        })}
        {drawType === "PRIMITIVA" ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              reintegroHit
                ? "bg-emerald-500 text-white"
                : isBet
                ? "bg-slate-800 text-white"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            R {reintegro ?? "-"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
