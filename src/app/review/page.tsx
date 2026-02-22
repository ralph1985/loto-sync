"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type DrawType = "PRIMITIVA" | "EUROMILLONES";
type TicketStatus = "PENDIENTE" | "COMPROBADO" | "PREMIO";

type Group = {
  id: string;
  name: string;
  balanceCents?: number;
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
  priceCents?: number | null;
  playsJoker?: boolean;
  jokerNumber?: string | null;
  group?: Group | null;
  draw?: Draw | null;
  lines?: TicketLine[];
  receipt?: Receipt | null;
  checks?: TicketCheck[];
};

type TicketCheck = {
  id: string;
  drawDate: string;
  status: TicketStatus;
  reason?: string | null;
  winningNumbers?: number[] | null;
  winningStars?: number[] | null;
  matchesMain: number;
  matchesStars: number;
  prizeCents?: number | null;
  prizeSource?: string | null;
  checkedAt: string;
};

type VerifyResponse = {
  status: TicketStatus;
  reason?: string;
  matches?: {
    main: number;
    stars: number;
  };
  check?: TicketCheck;
  ticketStatus?: TicketStatus;
  result?: {
    game: DrawType;
    drawDate: string;
    numbers: number[];
    stars?: number[];
  };
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

const toDateInput = (value?: string | null) => {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
};

const formatPrice = (priceCents?: number | null) => {
  if (priceCents === null || priceCents === undefined) return "Sin precio";
  return `${(priceCents / 100).toFixed(2)} EUR`;
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
  const [drawTypeFilter, setDrawTypeFilter] = useState<"ALL" | DrawType>("ALL");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [checkDrawDate, setCheckDrawDate] = useState<string>("");
  const [manualPrizeInput, setManualPrizeInput] = useState<string>("");
  const [savingPrize, setSavingPrize] = useState(false);
  const [prizeError, setPrizeError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [ticketsResponse, groupsResponse] = await Promise.all([
      fetch("/api/tickets"),
      fetch("/api/groups"),
    ]);

    if (!ticketsResponse.ok || !groupsResponse.ok) {
      throw new Error("No se pudieron cargar los boletos.");
    }

    const ticketsPayload = await ticketsResponse.json();
    const groupsPayload = await groupsResponse.json();
    const nextTickets = ticketsPayload.data ?? [];
    setTickets(nextTickets);
    setSelectedTicket((current) =>
      current ? nextTickets.find((ticket: Ticket) => ticket.id === current.id) ?? null : current
    );
    setGroups(groupsPayload.data ?? []);
  }, []);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!isActive) return;
        await loadData();
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
  }, [loadData]);

  useEffect(() => {
    if (!selectedTicket) return;
    setCheckDrawDate(toDateInput(selectedTicket.draw?.drawDate));
    setManualPrizeInput("");
    setPrizeError(null);
  }, [selectedTicket]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const statusOk = statusFilter === "ALL" || ticket.status === statusFilter;
      const groupOk =
        groupFilter === "ALL" || ticket.group?.id === groupFilter;
      const drawTypeOk =
        drawTypeFilter === "ALL" || ticket.draw?.type === drawTypeFilter;
      return statusOk && groupOk && drawTypeOk;
    });
  }, [tickets, statusFilter, groupFilter, drawTypeFilter]);

  const selectedGroupBalanceCents = useMemo(() => {
    if (groupFilter === "ALL") return null;
    return groups.find((group) => group.id === groupFilter)?.balanceCents ?? 0;
  }, [groupFilter, groups]);

  const activeCheck: TicketCheck | null =
    verifyResult?.check ?? selectedTicket?.checks?.[0] ?? null;

  const winningMainNumbers = useMemo(
    () => new Set((activeCheck?.winningNumbers ?? []).map((value) => Number(value))),
    [activeCheck]
  );
  const winningStars = useMemo(
    () => new Set((activeCheck?.winningStars ?? []).map((value) => Number(value))),
    [activeCheck]
  );

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
            <div className="grid gap-3 md:grid-cols-3">
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
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sorteo
                </label>
                <select
                  value={drawTypeFilter}
                  onChange={(event) =>
                    setDrawTypeFilter(event.target.value as "ALL" | DrawType)
                  }
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                >
                  {DRAW_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Bote por grupo</h2>
              <p className="text-sm text-slate-500">
                Saldo calculado por movimientos (entradas y gastos de boletos).
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
              {groupFilter === "ALL"
                ? "Selecciona un grupo para ver su bote actual."
                : `Bote actual: ${formatPrice(selectedGroupBalanceCents)}`}
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
              const hasReceipt = Boolean(ticket.receipt?.blobUrl);
              const firstLine = ticket.lines?.[0];
              const mainNumbers = firstLine
                ? firstLine.numbers
                    .filter((number) => number.kind === "MAIN")
                    .sort((a, b) => a.position - b.position)
                    .map((number) => number.value)
                : [];
              const stars = firstLine
                ? firstLine.numbers
                    .filter((number) => number.kind === "STAR")
                    .sort((a, b) => a.position - b.position)
                    .map((number) => number.value)
                : [];
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
                      <p className="mt-1 text-xs text-slate-500">
                        {formatPrice(ticket.priceCents)}
                        {ticket.draw?.type === "PRIMITIVA"
                          ? ticket.playsJoker
                            ? ` · Joker ${ticket.jokerNumber ?? "-"}`
                            : " · Sin Joker"
                          : ""}
                      </p>
                      <div className="mt-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            hasReceipt
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {hasReceipt
                            ? "Con resguardo adjunto"
                            : "Sin resguardo adjunto"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {mainNumbers.length > 0 ? (
                          mainNumbers.map((value, index) => (
                            <span
                              key={`${ticket.id}-main-${index}`}
                              className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                            >
                              {value}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">
                            Sin numeros
                          </span>
                        )}
                        {stars.length > 0
                          ? stars.map((value, index) => (
                              <span
                                key={`${ticket.id}-star-${index}`}
                                className="rounded-full bg-[#f9c784] px-3 py-1 text-xs font-semibold text-slate-900"
                              >
                                {value}
                              </span>
                            ))
                          : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTicket(ticket);
                        setVerifyResult(null);
                        setVerifyError(null);
                      }}
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
                <p className="text-xs text-slate-500">
                  {formatPrice(selectedTicket.priceCents)} ·{" "}
                  {selectedTicket.draw?.type === "PRIMITIVA"
                    ? selectedTicket.playsJoker
                      ? `Joker ${selectedTicket.jokerNumber ?? "-"}`
                      : "Sin Joker"
                    : "Joker no aplica"}
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

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                <span>Comprobacion de premio (API externa)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={checkDrawDate}
                    onChange={(event) => setCheckDrawDate(event.target.value)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      setVerifying(true);
                      setVerifyError(null);
                      setVerifyResult(null);
                      try {
                        const query = new URLSearchParams({
                          ticketId: selectedTicket.id,
                        });
                        if (checkDrawDate) {
                          query.set("drawDate", checkDrawDate);
                        }
                        const response = await fetch(
                          `/api/results/verify?${query.toString()}`
                        );
                        const payload = await response.json();
                        if (!response.ok) {
                          throw new Error(payload?.error || "Error al comprobar.");
                        }
                        setVerifyResult(payload.data);
                        await loadData();
                      } catch (error) {
                        setVerifyError(
                          error instanceof Error
                            ? error.message
                            : "Error al comprobar."
                        );
                      } finally {
                        setVerifying(false);
                      }
                    }}
                    className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                  >
                    {verifying ? "Comprobando..." : "Comprobar"}
                  </button>
                </div>
              </div>
              {verifyError ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {verifyError}
                </div>
              ) : null}
              {verifyResult ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {verifyResult.status === "PENDIENTE"
                    ? verifyResult.reason ?? "Pendiente de sorteo."
                    : `Aciertos: ${verifyResult.matches?.main ?? 0}${
                        verifyResult.matches?.stars
                          ? ` + ${verifyResult.matches?.stars} estrellas`
                          : ""
                      }`}
                </div>
              ) : null}
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Premio manual (EUR):</span>
                  <input
                    value={manualPrizeInput}
                    onChange={(event) => setManualPrizeInput(event.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="w-24 rounded-full border border-slate-300 px-3 py-1 text-[11px] text-slate-700"
                  />
                  <button
                    type="button"
                    disabled={savingPrize}
                    onClick={async () => {
                      setPrizeError(null);
                      const parsed = Number.parseFloat(
                        manualPrizeInput.replace(",", ".")
                      );
                      if (Number.isNaN(parsed) || parsed < 0) {
                        setPrizeError("Introduce un importe valido.");
                        return;
                      }
                      setSavingPrize(true);
                      try {
                        const response = await fetch("/api/results/prize", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            ticketId: selectedTicket.id,
                            drawDate: checkDrawDate || undefined,
                            prizeCents: Math.round(parsed * 100),
                          }),
                        });
                        const payload = await response.json();
                        if (!response.ok) {
                          throw new Error(payload?.error || "No se pudo guardar.");
                        }
                        await loadData();
                      } catch (error) {
                        setPrizeError(
                          error instanceof Error
                            ? error.message
                            : "No se pudo guardar."
                        );
                      } finally {
                        setSavingPrize(false);
                      }
                    }}
                    className="rounded-full border border-slate-300 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
                  >
                    {savingPrize ? "Guardando..." : "Guardar premio"}
                  </button>
                </div>
                {prizeError ? (
                  <p className="mt-2 text-xs text-rose-700">{prizeError}</p>
                ) : null}
              </div>
              {(selectedTicket.checks?.length ?? 0) > 0 ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Historial de comprobaciones
                  </p>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    {(selectedTicket.checks ?? []).map((check) => (
                      <div
                        key={check.id}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span>
                          {formatDate(check.drawDate)} · {check.status} ·{" "}
                          {check.matchesMain} aciertos
                          {check.matchesStars ? ` + ${check.matchesStars} estrellas` : ""}
                        </span>
                        <span>{formatPrice(check.prizeCents ?? null)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
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
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                winningMainNumbers.has(value)
                                  ? "bg-emerald-500 text-white"
                                  : "bg-slate-900 text-white"
                              }`}
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
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  winningStars.has(value)
                                    ? "bg-emerald-200 text-emerald-900"
                                    : "bg-[#f9c784] text-slate-900"
                                }`}
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
