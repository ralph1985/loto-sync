"use client";

import { InlineAlert } from "@/components/ui/inline-alert";
import { NumberBadge } from "@/components/ui/number-badge";
import {
  buildDrawLabel,
  formatDate,
  formatPrice,
  getMainNumbers,
  getStarNumbers,
} from "@/features/tickets/formatters";
import type { Ticket } from "@/features/tickets/types";

type RecentTicketsProps = {
  tickets: Ticket[];
  loading: boolean;
  error: string | null;
  copiedTicketId: string | null;
  onCopy: (ticket: Ticket) => void | Promise<void>;
  onSelect: (ticket: Ticket) => void;
};

export function RecentTickets({
  tickets,
  loading,
  error,
  copiedTicketId,
  onCopy,
  onSelect,
}: RecentTicketsProps) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/90 p-4 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Boletos recientes
      </h4>
      {error ? <InlineAlert tone="error" className="mt-3">{error}</InlineAlert> : null}
      {loading ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-16 animate-pulse rounded-2xl border border-slate-200 bg-white/70"
            />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Aun no hay boletos guardados.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {tickets.map((ticket) => {
            const firstLine = ticket.lines?.[0];
            const mainNumbers = getMainNumbers(firstLine);
            const stars = getStarNumbers(firstLine);

            return (
              <div
                key={ticket.id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-slate-400">
                  <span>
                    {ticket.group?.name ?? "Grupo"} · {ticket.status}
                  </span>
                  <span>{formatDate(ticket.createdAt)}</span>
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {buildDrawLabel(ticket.draw)}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {mainNumbers.length > 0 ? (
                    mainNumbers.map((value, index) => (
                      <NumberBadge
                        key={`${ticket.id}-main-${index}`}
                        value={value}
                        tone="neutral"
                      />
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">Sin numeros</span>
                  )}
                  {stars.length > 0
                    ? stars.map((value, index) => (
                        <NumberBadge
                          key={`${ticket.id}-star-${index}`}
                          value={value}
                          tone="accent"
                        />
                      ))
                    : null}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {ticket.lines?.length ?? 0} linea(s) · {formatPrice(ticket.priceCents)}
                    {ticket.draw?.type === "PRIMITIVA"
                      ? ticket.playsJoker
                        ? ` · Joker ${ticket.jokerNumber ?? "-"}`
                        : " · Sin Joker"
                      : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onCopy(ticket)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                    >
                      {copiedTicketId === ticket.id ? "Copiado" : "Copiar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelect(ticket)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                    >
                      Ver detalle
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
