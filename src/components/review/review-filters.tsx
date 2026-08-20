import type { DrawType, TicketStatus } from "@/features/tickets/types";

type ReviewFiltersProps = {
  statusFilter: "ALL" | TicketStatus;
  drawTypeFilter: "ALL" | DrawType;
  onStatusChange: (value: "ALL" | TicketStatus) => void;
  onDrawTypeChange: (value: "ALL" | DrawType) => void;
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
}: ReviewFiltersProps) {
  return (
    <div className="min-w-0 max-w-full border-y border-base-300 py-4">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-semibold text-base-content/60">Estado</span>
          <select
            value={statusFilter}
            onChange={(event) => onStatusChange(event.target.value as "ALL" | TicketStatus)}
            className="w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-semibold text-base-content/60">Sorteo</span>
          <select
            value={drawTypeFilter}
            onChange={(event) => onDrawTypeChange(event.target.value as "ALL" | DrawType)}
            className="w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
          >
            {DRAW_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
