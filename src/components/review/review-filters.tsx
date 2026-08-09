import type { Group, DrawType, TicketStatus } from "@/features/tickets/types";

type ReviewFiltersProps = {
  groups: Group[];
  groupFilter: string;
  statusFilter: "ALL" | TicketStatus;
  drawTypeFilter: "ALL" | DrawType;
  selectedGroupBalanceCents: number | null;
  onGroupChange: (value: string) => void;
  onStatusChange: (value: "ALL" | TicketStatus) => void;
  onDrawTypeChange: (value: "ALL" | DrawType) => void;
  onRefresh: () => void;
  onOpenContribution: () => void;
  onOpenMovements: () => void;
  formatPrice: (value?: number | null) => string;
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
  groups,
  groupFilter,
  statusFilter,
  drawTypeFilter,
  selectedGroupBalanceCents,
  onGroupChange,
  onStatusChange,
  onDrawTypeChange,
  onRefresh,
  onOpenContribution,
  onOpenMovements,
  formatPrice,
}: ReviewFiltersProps) {
  return (
    <section className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
      <div className="grid gap-4 md:grid-cols-4">
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Grupo</span>
          <select
            value={groupFilter}
            onChange={(event) => onGroupChange(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
          >
            <option value="ALL">Todos</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>

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

        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Bote del grupo</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">
            {groupFilter === "ALL" ? "Selecciona grupo" : formatPrice(selectedGroupBalanceCents)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
            >
              Actualizar datos
            </button>
            {groupFilter !== "ALL" ? (
              <>
                <button
                  type="button"
                  onClick={onOpenContribution}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700"
                >
                  Recargar bote
                </button>
                <button
                  type="button"
                  onClick={onOpenMovements}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                >
                  Ver historial
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
