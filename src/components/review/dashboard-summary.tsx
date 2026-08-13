"use client";

import { useEffect, useMemo, useState } from "react";

import type { Group, GroupMember, Ticket } from "@/features/tickets/types";
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
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersGroupId, setMembersGroupId] = useState<string | null>(null);
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
  const membersLoading = groupFilter !== "ALL" && membersGroupId !== groupFilter;
  const nextTicket = useMemo(
    () => [...scopedTickets].sort((left, right) => (left.draw?.drawDate ?? "").localeCompare(right.draw?.drawDate ?? ""))[0] ?? null,
    [scopedTickets]
  );

  useEffect(() => {
    if (groupFilter === "ALL") {
      return;
    }
    const controller = new AbortController();
    fetch(`/api/groups/${groupFilter}/members`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "No se pudieron cargar los participantes.");
        setMembers(payload.data ?? []);
        setMembersGroupId(groupFilter);
        setMembersError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMembersGroupId(groupFilter);
        setMembersError(error instanceof Error ? error.message : "No se pudieron cargar los participantes.");
      })
    return () => controller.abort();
  }, [groupFilter]);

  return (
    <section className="space-y-4" aria-labelledby="dashboard-summary-title">
      <div className="overflow-hidden rounded-[2rem] border border-base-300 bg-base-100 shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-base-content/60">
                  <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                  <span>Grupo activo</span>
                  <select value={groupFilter} onChange={(event) => onGroupChange(event.target.value)} className="select select-ghost select-xs -ml-1 min-w-32 px-1 font-bold text-base-content">
                    <option value="ALL">Todos los grupos</option>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
                <h2 id="dashboard-summary-title" className="mt-4 text-3xl font-bold tracking-[-0.04em] text-base-content sm:text-4xl">
                  {selectedGroup?.name ?? "Tus grupos"}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-base-content/65">
                  {selectedGroup ? "El estado de las apuestas y del bote de este grupo, en una sola vista." : "Elige un grupo para ver su actividad, participantes y próximos sorteos."}
                </p>
              </div>
              {selectedGroup ? <MemberStrip members={members} loading={membersLoading} error={membersError} /> : null}
            </div>

            {selectedGroup ? (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <div className={`rounded-2xl border p-4 ${prizeCount > 0 ? "border-success/30 bg-success/5" : "border-base-300 bg-base-200/45"}`}>
                  <p className="text-xs font-semibold text-base-content/60">Estado del grupo</p>
                  <p className="mt-2 text-xl font-bold text-base-content">{prizeCount > 0 ? `${prizeCount} premio${prizeCount === 1 ? "" : "s"} para revisar` : pendingCount > 0 ? `${pendingCount} boleto${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"}` : "Todo al día"}</p>
                  <p className="mt-1 text-xs text-base-content/60">{missingResultsCount > 0 ? `${missingResultsCount} resultado${missingResultsCount === 1 ? "" : "s"} pendiente${missingResultsCount === 1 ? "" : "s"} de cargar` : "Resultados disponibles y revisados"}</p>
                </div>
                <div className="rounded-2xl border border-base-300 bg-base-200/45 p-4">
                  <p className="text-xs font-semibold text-base-content/60">Próximo boleto</p>
                  <p className="mt-2 text-xl font-bold text-base-content">{nextTicket?.draw?.type === "EUROMILLONES" ? "Euromillones" : nextTicket?.draw?.type === "PRIMITIVA" ? "La Primitiva" : "Sin boletos"}</p>
                  <p className="mt-1 text-xs text-base-content/60">{nextTicket?.draw?.drawDate ? formatDate(nextTicket.draw.drawDate) : "Crea o asigna el primer boleto"}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button type="button" onClick={onRefresh} className="btn btn-primary btn-sm">Actualizar estado</button>
              {groupFilter !== "ALL" && selectedGroup?.balanceTrackingEnabled !== false ? <>
                <button type="button" onClick={onOpenContribution} className="btn btn-outline btn-sm">Añadir al bote</button>
                <button type="button" onClick={onOpenMovements} className="btn btn-ghost btn-sm">Ver movimientos</button>
              </> : null}
            </div>
          </div>
          <aside className="border-t border-base-300 bg-base-200/45 p-5 lg:border-l lg:border-t-0 sm:p-7">
            <p className="text-xs font-semibold text-base-content/60">Saldo del grupo</p>
            {showBalance ? <p className="mt-3 text-3xl font-bold tracking-[-0.04em] text-base-content">{formatPrice(balanceCents)}</p> : <p className="mt-3 text-lg font-bold text-base-content">No disponible</p>}
            <p className="mt-2 text-xs leading-5 text-base-content/60">{groupFilter === "ALL" ? "Suma de los grupos con seguimiento activo" : "Disponible para gastos y premios"}</p>
            <div className="mt-8 border-t border-base-300 pt-4">
              <p className="text-xs font-semibold text-base-content/60">Resumen rápido</p>
              <dl className="mt-3 space-y-3 text-sm">
                <SummaryLine label="Premios" value={String(prizeCount)} />
                <SummaryLine label="Pendientes" value={String(pendingCount)} />
                <SummaryLine label="Resultados faltantes" value={String(missingResultsCount)} />
              </dl>
            </div>
          </aside>
        </div>
      </div>

      {groupFilter === "ALL" ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Tus grupos">
        {groups.map((group) => {
          const groupTickets = tickets.filter((ticket) => ticket.group?.id === group.id);
          const groupPending = groupTickets.filter((ticket) => ticket.status === "PENDIENTE").length;
          const groupPrizes = groupTickets.filter((ticket) => ticket.status === "PREMIO" || ticket.checks?.some((check) => (check.prizeCents ?? 0) > 0)).length;
          return <button key={group.id} type="button" onClick={() => onGroupChange(group.id)} className="group flex items-center justify-between rounded-2xl border border-base-300 bg-base-100 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-sm active:translate-y-0">
            <span><span className="block font-semibold text-base-content">{group.name}</span><span className="mt-1 block text-xs text-base-content/60">{groupPrizes} premios · {groupPending} pendientes</span></span>
            <span className="text-sm font-bold text-primary transition-transform group-hover:translate-x-0.5">Abrir →</span>
          </button>;
        })}
      </div> : null}
    </section>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-base-content/60">{label}</dt><dd className="font-bold text-base-content">{value}</dd></div>;
}

function MemberStrip({ members, loading, error }: { members: GroupMember[]; loading: boolean; error: string | null }) {
  if (loading) return <div className="h-8 w-28 animate-pulse rounded-full bg-base-300" aria-label="Cargando participantes" />;
  if (error) return <span className="max-w-40 text-right text-xs text-error">{error}</span>;
  if (members.length === 0) return <span className="text-xs text-base-content/60">Sin participantes</span>;
  return <div className="flex items-center gap-2" aria-label={`${members.length} participantes`}>
    <div className="flex -space-x-2">
      {members.slice(0, 4).map((member) => <span key={member.id} title={`${member.user.name} · ${member.role === "OWNER" ? "Owner" : "Participante"}`} className="grid h-8 w-8 place-items-center rounded-full border-2 border-base-100 bg-primary/15 text-xs font-bold text-primary">{getInitials(member.user.name)}</span>)}
    </div>
    <span className="text-xs font-semibold text-base-content/60">{members.length} {members.length === 1 ? "persona" : "personas"}</span>
  </div>;
}

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(new Date(value));
}
