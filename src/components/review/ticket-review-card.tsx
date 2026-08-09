import { buildDrawLabel, formatDateTime, formatPrice, getMainNumbers, getStarNumbers } from "@/features/tickets/formatters";
import { sortChecksByDate } from "@/features/tickets/review-utils";
import type { Ticket } from "@/features/tickets/types";

import { TicketReviewComparisons } from "@/components/review/ticket-review-comparisons";

type TicketReviewCardProps = {
  ticket: Ticket;
  active: boolean;
  expanded: boolean;
  onToggleComparisons: () => void;
  onSelect: () => void;
};

export function TicketReviewCard({
  ticket,
  active,
  expanded,
  onToggleComparisons,
  onSelect,
}: TicketReviewCardProps) {
  const firstLine = ticket.lines?.[0];
  const mainNumbers = getMainNumbers(firstLine);
  const stars = getStarNumbers(firstLine);
  const reintegro = firstLine?.reintegro ?? null;
  const checks = sortChecksByDate(ticket.checks);
  const totalPrizeCents = checks.reduce(
    (sum, check) => sum + (check.prizeCents ?? 0),
    0
  );

  return (
    <article
      className={`rounded-3xl border bg-white/95 p-3 shadow-[0_16px_44px_rgba(15,23,42,0.08)] sm:p-4 ${
        active ? "border-emerald-300" : "border-white/70"
      }`}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              {ticket.group?.name ?? "Grupo"}
            </span>
            {active ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                Activo
              </span>
            ) : null}
            <span
              className={`rounded-full px-3 py-1 ${
                ticket.status === "PREMIO"
                  ? "bg-emerald-100 text-emerald-700"
                  : ticket.status === "COMPROBADO"
                  ? "bg-sky-100 text-sky-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {ticket.status}
            </span>
            {ticket.receipt?.blobUrl ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Resguardo
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                Sin resguardo
              </span>
            )}
          </div>

          <div>
            <h3 className="text-xl font-semibold text-slate-900">
              {buildDrawLabel(ticket.draw)}
            </h3>
            <p className="text-sm text-slate-500">Alta: {formatDateTime(ticket.createdAt)}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <TicketMetric label="Precio" value={formatPrice(ticket.priceCents)} />
            <TicketMetric label="Premio acumulado" value={formatPrice(totalPrizeCents)} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Números apostados
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {mainNumbers.length > 0 ? (
                mainNumbers.map((value, index) => (
                  <span
                    key={`${ticket.id}-main-${index}`}
                    className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                  >
                    {value}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400">Sin números</span>
              )}
              {stars.map((value, index) => (
                <span
                  key={`${ticket.id}-star-${index}`}
                  className="rounded-full bg-[#f9c784] px-3 py-1 text-xs font-semibold text-slate-900"
                >
                  {value}
                </span>
              ))}
              {ticket.draw?.type === "PRIMITIVA" ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  R {reintegro ?? "-"}
                </span>
              ) : null}
            </div>
          </div>

          <TicketReviewComparisons
            ticket={ticket}
            checks={checks}
            mainNumbers={mainNumbers}
            stars={stars}
            reintegro={reintegro}
            expanded={expanded}
            onToggle={onToggleComparisons}
          />
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={onSelect}
            className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
          >
            Ver detalle
          </button>
        </div>
      </div>
    </article>
  );
}

function TicketMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
