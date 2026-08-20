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
    <section className="flex flex-col gap-4" aria-busy={loading}>
      {error ? (
        <div className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-3" aria-label="Cargando boletos">
          {[0, 1].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-base-300" />)}
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-2xl border border-base-300 bg-base-100 px-4 py-6 text-sm text-base-content/60">
          No hay boletos que coincidan con los filtros.
        </div>
      ) : visibleTickets.length === 0 ? (
        <div className="rounded-2xl border border-base-300 bg-base-100 px-4 py-6 text-sm text-base-content/60">
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
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
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
