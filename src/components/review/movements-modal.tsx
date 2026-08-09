import { ModalShell } from "@/components/ui/modal-shell";
import { formatDateTime, formatPrice } from "@/features/tickets/formatters";
import type { GroupMovement, MovementType } from "@/features/tickets/types";

type MovementsModalProps = {
  open: boolean;
  groupName: string;
  balanceCents: number | null;
  movementTypeFilter: "ALL" | MovementType;
  movements: GroupMovement[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onFilterChange: (value: "ALL" | MovementType) => void;
};

const MOVEMENT_TYPE_OPTIONS: { value: "ALL" | MovementType; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "OPENING", label: "Saldo inicial" },
  { value: "CONTRIBUTION", label: "Aportación" },
  { value: "TICKET_EXPENSE", label: "Gasto boleto" },
  { value: "PRIZE", label: "Premio" },
  { value: "ADJUSTMENT", label: "Ajuste" },
];

export function MovementsModal({
  open,
  groupName,
  balanceCents,
  movementTypeFilter,
  movements,
  loading,
  error,
  onClose,
  onFilterChange,
}: MovementsModalProps) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      ariaLabel="Historial de bote"
      panelClassName="max-w-3xl border border-slate-200 bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.35)] sm:p-6"
    >
      <div className="mb-4 flex flex-col gap-3 pr-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Historial de bote</h3>
          <p className="text-sm text-slate-500">{groupName}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Bote pendiente: {formatPrice(balanceCents)}
          </p>
        </div>
        <select
          aria-label="Filtrar movimientos"
          value={movementTypeFilter}
          onChange={(event) => onFilterChange(event.target.value as "ALL" | MovementType)}
          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
        >
          {MOVEMENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="max-h-[60vh] overflow-y-auto pr-1">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : loading ? (
          <p className="text-sm text-slate-500">Cargando historial...</p>
        ) : movements.length === 0 ? (
          <p className="text-sm text-slate-500">No hay movimientos para este filtro.</p>
        ) : (
          <div className="space-y-2">
            {movements.map((movement) => {
              const isPositive = movement.amountCents >= 0;
              const typeLabel =
                MOVEMENT_TYPE_OPTIONS.find((item) => item.value === movement.type)?.label ??
                movement.type;
              return (
                <div
                  key={movement.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wide text-slate-500">
                      {typeLabel}
                    </span>
                    <span className="text-slate-400">{formatDateTime(movement.occurredAt)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        isPositive ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {formatPrice(movement.amountCents)}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      Balance: {formatPrice(movement.runningBalanceCents)}
                    </span>
                  </div>
                  {movement.note ? (
                    <p className="mt-1 text-xs text-slate-500">{movement.note}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
