"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DrawType = "PRIMITIVA" | "EUROMILLONES";
type TicketStatus = "PENDIENTE" | "COMPROBADO" | "PREMIO";

type Group = {
  id: string;
  name: string;
};

type Draw = {
  id: string;
  type: DrawType;
  drawDate: string;
  label?: string | null;
};

type TicketLineNumber = {
  id: string;
  kind: "MAIN" | "STAR";
  position: number;
  value: number;
};

type TicketLine = {
  id: string;
  lineIndex: number;
  complement?: number | null;
  reintegro?: number | null;
  numbers: TicketLineNumber[];
};

type Receipt = {
  id: string;
  blobUrl: string;
};

type Ticket = {
  id: string;
  status: TicketStatus;
  createdAt: string;
  group?: Group | null;
  draw?: Draw | null;
  lines?: TicketLine[];
  receipt?: Receipt | null;
};

const STATUS_OPTIONS: { value: "ALL" | TicketStatus; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "COMPROBADO", label: "Comprobado" },
  { value: "PREMIO", label: "Premio" },
];

const DRAW_LABELS: Record<DrawType, string> = {
  PRIMITIVA: "Primitiva",
  EUROMILLONES: "Euromillones",
};

const formatDate = (value?: string | null) => {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleDateString("es-ES");
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleString("es-ES");
};

const buildDrawLabel = (draw?: Draw | null) => {
  if (!draw) return "Sorteo";
  return draw.label ?? `${DRAW_LABELS[draw.type]} · ${formatDate(draw.drawDate)}`;
};

export default function ReviewPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | TicketStatus>("ALL");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [ticketsResponse, groupsResponse] = await Promise.all([
          fetch("/api/tickets"),
          fetch("/api/groups"),
        ]);

        if (!ticketsResponse.ok || !groupsResponse.ok) {
          throw new Error("No se pudieron cargar los boletos.");
        }

        const ticketsPayload = await ticketsResponse.json();
        const groupsPayload = await groupsResponse.json();

        if (!isActive) return;

        setTickets(ticketsPayload.data ?? []);
        setGroups(groupsPayload.data ?? []);
      } catch (loadError) {
        if (!isActive) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar los boletos."
        );
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      isActive = false;
    };
  }, []);

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const statusOk = statusFilter === "ALL" || ticket.status === statusFilter;
      const groupOk =
        groupFilter === "ALL" || ticket.group?.id === groupFilter;
      return statusOk && groupOk;
    });
  }, [tickets, statusFilter, groupFilter]);

  return (
    <div className="relative min-h-screen bg-[#f7f2ea] text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-[#f9c784]/50 blur-3xl animate-glow" />
        <div className="absolute right-[-120px] top-48 h-96 w-96 rounded-full bg-[#9bb7ff]/35 blur-3xl animate-glow" />
        <div className="absolute bottom-[-160px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#f5a1b0]/30 blur-[120px]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-16 pt-10 md:px-10 md:pt-16">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
              Revisión
            </span>
            <h1 className="text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
              Revisar boletos por grupo y estado.
            </h1>
            <p className="max-w-2xl text-base text-slate-600">
              Filtra y consulta los boletos guardados. Abre cada tarjeta para ver
              números, notas y resguardos.
            </p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-700 transition hover:border-slate-400"
            href="/"
          >
            Volver a alta
          </Link>
        </header>

        <section className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">
                Filtros rapidos
              </h2>
              <p className="text-sm text-slate-500">
                Usa los filtros para revisar estados específicos.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Grupo
                </label>
                <select
                  value={groupFilter}
                  onChange={(event) => setGroupFilter(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                >
                  <option value="ALL">Todos</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Estado
                </label>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as "ALL" | TicketStatus
                    )
                  }
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

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
          ) : (
            filteredTickets.map((ticket) => {
              const lineCount = ticket.lines?.length ?? 0;
              return (
                <div
                  key={ticket.id}
                  className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        {ticket.group?.name ?? "Grupo"} · {ticket.status}
                      </div>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">
                        {buildDrawLabel(ticket.draw)}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {formatDateTime(ticket.createdAt)} · {lineCount} linea(s)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTicket(ticket)}
                      className="rounded-full border border-slate-200 bg-white px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                    >
                      Ver detalle
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </main>
      {selectedTicket ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setSelectedTicket(null)}
          />
          <div className="relative w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  {selectedTicket.group?.name ?? "Grupo"} ·{" "}
                  {selectedTicket.status}
                </div>
                <h3 className="mt-1 text-2xl font-semibold text-slate-900">
                  {buildDrawLabel(selectedTicket.draw)}
                </h3>
                <p className="text-sm text-slate-500">
                  {formatDateTime(selectedTicket.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Numeros
                </h4>
                <div className="mt-3 space-y-3">
                  {(selectedTicket.lines ?? []).map((line) => {
                    const main = line.numbers
                      .filter((number) => number.kind === "MAIN")
                      .sort((a, b) => a.position - b.position)
                      .map((number) => number.value);
                    const stars = line.numbers
                      .filter((number) => number.kind === "STAR")
                      .sort((a, b) => a.position - b.position)
                      .map((number) => number.value);
                    return (
                      <div
                        key={line.id}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Linea {line.lineIndex}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {main.map((value, index) => (
                            <span
                              key={`${line.id}-main-${index}`}
                              className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                            >
                              {value}
                            </span>
                          ))}
                        </div>
                        {stars.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {stars.map((value, index) => (
                              <span
                                key={`${line.id}-star-${index}`}
                                className="rounded-full bg-[#f9c784] px-3 py-1 text-xs font-semibold text-slate-900"
                              >
                                {value}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-slate-500">
                            Complementario: {line.complement ?? "-"} · Reintegro:{" "}
                            {line.reintegro ?? "-"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Resguardo
                </h4>
                {selectedTicket.receipt?.blobUrl ? (
                  <div className="mt-3 space-y-3">
                    <img
                      src={selectedTicket.receipt.blobUrl}
                      alt="Resguardo"
                      className="w-full rounded-2xl border border-slate-200 object-cover"
                    />
                    <a
                      href={selectedTicket.receipt.blobUrl}
                      className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Abrir imagen
                    </a>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    No hay resguardo adjunto.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
