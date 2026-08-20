"use client";

import { useEffect, useMemo, useState } from "react";

import { formatPrice } from "@/features/tickets/formatters";
import type { Group, GroupMember, Ticket } from "@/features/tickets/types";

type DashboardSummaryProps = {
  group: Group | null;
  tickets: Ticket[];
  missingResultsCount: number;
  onRefresh: () => void;
  onOpenContribution: () => void;
  onOpenMovements: () => void;
};

export function DashboardSummary({
  group,
  tickets,
  missingResultsCount,
  onRefresh,
  onOpenContribution,
  onOpenMovements,
}: DashboardSummaryProps) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersGroupId, setMembersGroupId] = useState<string | null>(null);
  const scopedTickets = useMemo(
    () => group ? tickets.filter((ticket) => ticket.group?.id === group.id) : [],
    [group, tickets]
  );
  const prizeCount = scopedTickets.filter((ticket) =>
    ticket.status === "PREMIO" || ticket.checks?.some((check) => (check.prizeCents ?? 0) > 0)
  ).length;
  const pendingCount = scopedTickets.filter((ticket) => ticket.status === "PENDIENTE").length;
  const membersLoading = Boolean(group && membersGroupId !== group.id);
  const nextTicket = useMemo(
    () => [...scopedTickets].sort((left, right) => (left.draw?.drawDate ?? "").localeCompare(right.draw?.drawDate ?? ""))[0] ?? null,
    [scopedTickets]
  );

  useEffect(() => {
    if (!group) return;
    const controller = new AbortController();
    fetch(`/api/groups/${group.id}/members`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "No se pudieron cargar los participantes.");
        setMembers(payload.data ?? []);
        setMembersGroupId(group.id);
        setMembersError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMembersGroupId(group.id);
        setMembersError(error instanceof Error ? error.message : "No se pudieron cargar los participantes.");
      });
    return () => controller.abort();
  }, [group]);

  if (!group) {
    return (
      <section aria-label="Cargando grupo" className="animate-pulse border-b border-base-300 pb-7">
        <div className="h-5 w-28 rounded bg-base-300" />
        <div className="mt-3 h-10 w-64 rounded bg-base-300" />
        <div className="mt-7 h-24 rounded-2xl bg-base-300" />
      </section>
    );
  }

  const balanceEnabled = group.balanceTrackingEnabled !== false;
  const statusLabel = prizeCount > 0
    ? `${prizeCount} premio${prizeCount === 1 ? "" : "s"} para revisar`
    : pendingCount > 0
      ? `${pendingCount} boleto${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"}`
      : "Todo al día";

  return (
    <section aria-labelledby="dashboard-summary-title" className="min-w-0 max-w-full border-b border-base-300 pb-7">
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">Centro de grupo</p>
          <h1 id="dashboard-summary-title" className="mt-1 break-words text-3xl font-bold leading-tight tracking-[-0.04em] text-base-content sm:text-4xl">
            {group.name}
          </h1>
          <div className="mt-4">
            <MemberStrip members={members} loading={membersLoading} error={membersError} />
          </div>
        </div>

        <div className="min-w-0 max-w-full flex flex-col gap-4 lg:items-end">
          {balanceEnabled ? (
            <div className="lg:text-right">
              <p className="text-sm text-base-content/60">Saldo disponible</p>
              <p className="mt-1 text-3xl font-bold tracking-[-0.04em] text-base-content">{formatPrice(group.balanceCents ?? null)}</p>
            </div>
          ) : null}
          <div className="flex max-w-full flex-wrap gap-2 lg:justify-end">
            <button type="button" onClick={onRefresh} className="btn btn-primary btn-sm whitespace-nowrap">Actualizar</button>
            {balanceEnabled ? (
              <>
                <button type="button" onClick={onOpenContribution} className="btn btn-outline btn-sm whitespace-nowrap">Añadir al bote</button>
                <button type="button" onClick={onOpenMovements} className="btn btn-ghost btn-sm whitespace-nowrap">Ver movimientos</button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <dl className="mt-7 grid min-w-0 max-w-full overflow-hidden rounded-2xl border border-base-300 bg-base-100 sm:grid-cols-3 sm:divide-x sm:divide-base-300">
        <SummaryMetric label="Estado del grupo" value={statusLabel} detail={`${scopedTickets.length} boleto${scopedTickets.length === 1 ? "" : "s"} en total`} />
        <SummaryMetric
          label="Próximo boleto"
          value={nextTicket?.draw?.type === "EUROMILLONES" ? "Euromillones" : nextTicket?.draw?.type === "PRIMITIVA" ? "La Primitiva" : "Sin boletos"}
          detail={nextTicket?.draw?.drawDate ? formatDate(nextTicket.draw.drawDate) : "Todavía no hay un próximo sorteo"}
        />
        <SummaryMetric
          label="Resultados por cargar"
          value={String(missingResultsCount)}
          detail={missingResultsCount > 0 ? "Pendientes en el sistema" : "Resultados al día"}
        />
      </dl>
    </section>
  );
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 border-b border-base-300 p-4 last:border-b-0 sm:border-b-0 sm:p-5">
      <dt className="text-xs font-semibold text-base-content/60">{label}</dt>
      <dd className="mt-2 break-words text-lg font-bold text-base-content">{value}</dd>
      <dd className="mt-1 break-words text-xs text-base-content/55">{detail}</dd>
    </div>
  );
}

function MemberStrip({ members, loading, error }: { members: GroupMember[]; loading: boolean; error: string | null }) {
  if (loading) return <div className="h-9 w-36 animate-pulse rounded-xl bg-base-300" aria-label="Cargando participantes" />;
  if (error) return <span className="text-sm text-error">{error}</span>;
  if (members.length === 0) return <span className="text-sm text-base-content/60">Sin participantes</span>;
  return (
    <div className="flex items-center gap-3" aria-label={`${members.length} participantes`}>
      <div className="flex -space-x-2">
        {members.slice(0, 4).map((member) => (
          <span
            key={member.id}
            title={`${member.user.name}, ${member.role === "OWNER" ? "Owner" : "Participante"}`}
            className="grid h-9 w-9 place-items-center rounded-xl border-2 border-base-100 bg-primary/15 text-xs font-bold text-primary"
          >
            {getInitials(member.user.name)}
          </span>
        ))}
      </div>
      <span className="text-sm font-semibold text-base-content/60">{members.length} {members.length === 1 ? "persona" : "personas"}</span>
    </div>
  );
}

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(new Date(value));
}
