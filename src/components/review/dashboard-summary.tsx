import type { Group, Ticket } from "@/features/tickets/types";
import { formatPrice } from "@/features/tickets/formatters";

type DashboardSummaryProps = {
  groups: Group[];
  tickets: Ticket[];
  groupFilter: string;
  missingResultsCount: number;
  onGroupChange: (value: string) => void;
  onRefresh: () => void;
  onOpenContribution: () => void;
  onOpenMovements: () => void;
};

export function DashboardSummary({
  groups,
  tickets,
  groupFilter,
  missingResultsCount,
  onGroupChange,
  onRefresh,
  onOpenContribution,
  onOpenMovements,
}: DashboardSummaryProps) {
  const scopedTickets = groupFilter === "ALL"
    ? tickets
    : tickets.filter((ticket) => ticket.group?.id === groupFilter);
  const prizeCount = scopedTickets.filter((ticket) =>
    ticket.status === "PREMIO" || ticket.checks?.some((check) => (check.prizeCents ?? 0) > 0)
  ).length;
  const pendingCount = scopedTickets.filter((ticket) => ticket.status === "PENDIENTE").length;
  const balanceCents = groupFilter === "ALL"
    ? groups.reduce((total, group) => total + (group.balanceTrackingEnabled !== false ? group.balanceCents ?? 0 : 0), 0)
    : groups.find((group) => group.id === groupFilter)?.balanceCents ?? null;
  const selectedGroup = groups.find((group) => group.id === groupFilter);
  const showBalance = groupFilter === "ALL" || selectedGroup?.balanceTrackingEnabled !== false;

  return (
    <section className="space-y-4" aria-labelledby="dashboard-summary-title">
      <div className="flex flex-col gap-3 rounded-3xl border border-base-300 bg-base-100 p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Contexto del panel</p>
          <h2 id="dashboard-summary-title" className="mt-1 text-xl font-bold tracking-tight text-base-content sm:text-2xl">
            {selectedGroup?.name ?? "Todos los grupos"}
          </h2>
          <p className="mt-1 text-sm text-base-content/70">
            Premios y pendientes primero. El resto queda organizado por secciones.
          </p>
        </div>
        <label className="flex min-w-48 flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-base-content/60">Grupo</span>
          <select
            value={groupFilter}
            onChange={(event) => onGroupChange(event.target.value)}
            className="select select-bordered select-sm w-full"
          >
            <option value="ALL">Todos</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Premios" value={String(prizeCount)} tone={prizeCount > 0 ? "success" : "neutral"} detail={prizeCount > 0 ? "Revisar ahora" : "Sin premios detectados"} />
        <SummaryMetric label="Pendientes" value={String(pendingCount)} tone={pendingCount > 0 ? "warning" : "neutral"} detail={pendingCount > 0 ? "Boletos sin comprobar" : "Todo comprobado"} />
        <SummaryMetric label="Sorteos faltantes" value={String(missingResultsCount)} tone={missingResultsCount > 0 ? "warning" : "neutral"} detail={missingResultsCount > 0 ? "Primitiva por cargar" : "Histórico al día"} />
        {showBalance ? <SummaryMetric label="Saldo" value={formatPrice(balanceCents)} tone="accent" detail={groupFilter === "ALL" ? "Total de grupos" : "Bote del grupo"} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onRefresh} className="btn btn-sm btn-outline">Actualizar panel</button>
        {groupFilter !== "ALL" && selectedGroup?.balanceTrackingEnabled !== false ? (
          <>
            <button type="button" onClick={onOpenContribution} className="btn btn-sm btn-outline">Recargar bote</button>
            <button type="button" onClick={onOpenMovements} className="btn btn-sm btn-ghost">Ver movimientos</button>
          </>
        ) : null}
      </div>

      {groupFilter === "ALL" && groups.length > 1 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Resumen por grupo">
          {groups.map((group) => {
            const groupTickets = tickets.filter((ticket) => ticket.group?.id === group.id);
            const groupPending = groupTickets.filter((ticket) => ticket.status === "PENDIENTE").length;
            const groupPrizes = groupTickets.filter((ticket) => ticket.status === "PREMIO" || ticket.checks?.some((check) => (check.prizeCents ?? 0) > 0)).length;
            return (
              <button key={group.id} type="button" onClick={() => onGroupChange(group.id)} className="flex items-center justify-between rounded-2xl border border-base-300 bg-base-100 px-4 py-3 text-left transition hover:border-primary">
                <span>
                  <span className="block text-sm font-semibold text-base-content">{group.name}</span>
                  <span className="mt-1 block text-xs text-base-content/60">{groupPrizes} premios · {groupPending} pendientes</span>
                </span>
                {group.balanceTrackingEnabled !== false ? <span className="text-sm font-bold text-primary">{formatPrice(group.balanceCents ?? 0)}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function SummaryMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "success" | "warning" | "accent" | "neutral" }) {
  const toneClass = {
    success: "border-success/30 bg-success/5 text-success",
    warning: "border-warning/30 bg-warning/5 text-warning",
    accent: "border-primary/30 bg-primary/5 text-primary",
    neutral: "border-base-300 bg-base-100 text-base-content",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs opacity-75">{detail}</p>
    </div>
  );
}
