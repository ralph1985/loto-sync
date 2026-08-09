import type { Ticket } from "@/features/tickets/types";

import { TicketReviewCard } from "@/components/review/ticket-review-card";

type TicketReviewListProps = {
  error: string | null;
  loading: boolean;
  filteredTickets: Ticket[];
  visibleTickets: Ticket[];
  secondaryTickets: Ticket[];
  activeTicketId: string | null;
  expandedTickets: Record<string, boolean>;
  hasMoreSecondaryTickets: boolean;
  onToggleComparisons: (ticketId: string) => void;
  onSelectTicket: (ticket: Ticket) => void;
  onShowMore: () => void;
};

export function TicketReviewList({
  error,
  loading,
  filteredTickets,
  visibleTickets,
  secondaryTickets,
  activeTicketId,
  expandedTickets,
  hasMoreSecondaryTickets,
  onToggleComparisons,
  onSelectTicket,
  onShowMore,
}: TicketReviewListProps) {
  return (
    <section className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-6 text-sm text-slate-500">
          Cargando boletos...
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-6 text-sm text-slate-500">
          No hay boletos que coincidan con los filtros.
        </div>
      ) : visibleTickets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-6 text-sm text-slate-500">
          No hay apuestas para mostrar.
        </div>
      ) : (
        visibleTickets.map((ticket) => (
          <TicketReviewCard
            key={ticket.id}
            ticket={ticket}
            active={ticket.id === activeTicketId}
            expanded={expandedTickets[ticket.id] ?? false}
            onToggleComparisons={() => onToggleComparisons(ticket.id)}
            onSelect={() => onSelectTicket(ticket)}
          />
        ))
      )}
      {!loading && !error && filteredTickets.length > 0 && secondaryTickets.length > 0 ? (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={onShowMore}
            disabled={!hasMoreSecondaryTickets}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
              hasMoreSecondaryTickets
                ? "border border-slate-200 bg-white text-slate-600"
                : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
            }`}
          >
            {hasMoreSecondaryTickets ? "Mostrar 2 más" : "No hay más apuestas"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
