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
    <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grupo</span>
          <select
            value={groupFilter}
            onChange={(event) => onGroupChange(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
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
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</span>
          <select
            value={statusFilter}
            onChange={(event) => onStatusChange(event.target.value as "ALL" | TicketStatus)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sorteo</span>
          <select
            value={drawTypeFilter}
            onChange={(event) => onDrawTypeChange(event.target.value as "ALL" | DrawType)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
          >
            {DRAW_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bote</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
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
