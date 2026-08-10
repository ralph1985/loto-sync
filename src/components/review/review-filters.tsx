import type { DrawType, TicketStatus } from "@/features/tickets/types";

type ReviewFiltersProps = {
  statusFilter: "ALL" | TicketStatus;
  drawTypeFilter: "ALL" | DrawType;
  onStatusChange: (value: "ALL" | TicketStatus) => void;
  onDrawTypeChange: (value: "ALL" | DrawType) => void;
  onRefresh: () => void;
};

const STATUS_OPTIONS: { value: "ALL" | TicketStatus; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "COMPROBADO", label: "Comprobado" },
  { value: "PREMIO", label: "Premio" },
];

const DRAW_TYPE_OPTIONS: { value: "ALL" | DrawType; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "PRIMITIVA", label: "Primitiva" },
  { value: "EUROMILLONES", label: "Euromillones" },
];

export function ReviewFilters({
  statusFilter,
  drawTypeFilter,
  onStatusChange,
  onDrawTypeChange,
  onRefresh,
}: ReviewFiltersProps) {
  return (
    <section className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Estado</span>
          <select
            value={statusFilter}
            onChange={(event) => onStatusChange(event.target.value as "ALL" | TicketStatus)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Sorteo</span>
          <select
            value={drawTypeFilter}
            onChange={(event) => onDrawTypeChange(event.target.value as "ALL" | DrawType)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
          >
            {DRAW_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <button type="button" onClick={onRefresh} className="btn btn-sm btn-outline">Actualizar boletos</button>
        </div>
      </div>
    </section>
  );
}
