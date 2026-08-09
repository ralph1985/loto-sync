"use client";

import { useEffect, useState } from "react";

import { NumberBadge } from "@/components/ui/number-badge";
import { RecentTickets } from "@/components/create/recent-tickets";
import { TicketCreateForm } from "@/components/create/ticket-create-form";
import { TicketDetailModal } from "@/components/tickets/ticket-detail-modal";
import { buildDrawLabel, formatPrice } from "@/features/tickets/formatters";
import type { DrawType, Ticket } from "@/features/tickets/types";
import { useCreateData } from "@/hooks/use-create-data";
import { useTicketCreation } from "@/hooks/use-ticket-creation";

const DRAW_TYPES: { id: DrawType; label: string; description: string }[] = [
  {
    id: "PRIMITIVA",
    label: "Primitiva",
    description: "6 numeros + complementario + reintegro",
  },
  {
    id: "EUROMILLONES",
    label: "Euromillones",
    description: "5 numeros + 2 estrellas",
  },
];

export default function Home() {
  const {
    groups,
    tickets,
    loadingData,
    loadError,
    loadingTickets,
    ticketsError,
    canAccessCreate,
    refreshInitialData,
  } = useCreateData();
  const {
    drawType,
    setDrawType,
    primitivaCoverageMode,
    setPrimitivaCoverageMode,
    drawDate,
    setDrawDate,
    groupId,
    setGroupId,
    priceInput,
    setPriceInput,
    playsJoker,
    setPlaysJoker,
    jokerNumber,
    setJokerNumber,
    lines,
    setLines,
    notes,
    setNotes,
    receipt,
    setReceipt,
    submitted,
    saving,
    saveError,
    saveSuccess,
    validation,
    selectedDraw,
    handleLineChange,
    handleSubmit,
    weeklyDrawDates,
    createEmptyLine,
  } = useTicketCreation({ refreshInitialData });
  const [copiedTicketId, setCopiedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    if (!loadingData && groups.length === 1 && !groupId) {
      setGroupId(groups[0].id);
    }
  }, [groupId, groups, loadingData, setGroupId]);

  useEffect(() => {
    if (drawType !== "PRIMITIVA") {
      setPlaysJoker(false);
      setJokerNumber("");
      setPrimitivaCoverageMode("SINGLE");
    }
  }, [drawType, setJokerNumber, setPlaysJoker, setPrimitivaCoverageMode]);

  const selectedDrawType = drawType;
  const latestTickets = tickets.slice(0, 5);
  const selectedGroupBalanceCents =
    groups.find((group) => group.id === groupId)?.balanceCents ?? 0;

  const handleCopy = async (ticket: Ticket) => {
    const firstLine = ticket.lines?.[0];
    if (!firstLine) return;

    const mainNumbers = firstLine.numbers
      .filter((number) => number.kind === "MAIN")
      .sort((a, b) => a.position - b.position)
      .map((number) => number.value)
      .join(" ");
    const stars = firstLine.numbers
      .filter((number) => number.kind === "STAR")
      .sort((a, b) => a.position - b.position)
      .map((number) => number.value)
      .join(" ");
    const extras =
      stars.length > 0
        ? ` | Estrellas: ${stars}`
        : ` | C:${firstLine.complement ?? "-"} R:${firstLine.reintegro ?? "-"}`;

    const text = `${buildDrawLabel(ticket.draw)} · ${mainNumbers}${extras}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedTicketId(ticket.id);
      setTimeout(() => {
        setCopiedTicketId((current) => (current === ticket.id ? null : current));
      }, 2000);
    } catch {
      setCopiedTicketId(null);
    }
  };

  if (canAccessCreate !== true) {
    return null;
  }

  return (
    <div className="relative min-h-screen bg-[#f7f2ea] text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-[#f9c784]/50 blur-3xl animate-glow" />
        <div className="absolute right-[-120px] top-48 h-96 w-96 rounded-full bg-[#9bb7ff]/35 blur-3xl animate-glow" />
        <div className="absolute bottom-[-160px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#f5a1b0]/30 blur-[120px]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-6 sm:pt-8 md:px-8 lg:flex-row lg:gap-10 lg:px-10 lg:pt-16">
        <section className="flex flex-1 flex-col gap-6">
          <header className="animate-fade-up space-y-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
              Nuevo boleto
            </span>
            <h1 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl md:text-5xl">
              Alta rapida para tu grupo de loteria.
            </h1>
            <p className="max-w-xl text-base text-slate-600">
              Guarda numeros, grupo y resguardo en un solo paso. Validaciones
              listas para Primitiva y Euromillones.
            </p>
          </header>

          <TicketCreateForm
            drawTypes={DRAW_TYPES}
            drawType={drawType}
            onDrawTypeChange={setDrawType}
            groups={groups}
            groupId={groupId}
            onGroupChange={setGroupId}
            loadingData={loadingData}
            loadError={loadError}
            onRefreshData={refreshInitialData}
            drawDate={drawDate}
            onDrawDateChange={setDrawDate}
            coverageMode={primitivaCoverageMode}
            onCoverageModeChange={setPrimitivaCoverageMode}
            weeklyDrawDates={weeklyDrawDates}
            priceInput={priceInput}
            onPriceChange={setPriceInput}
            playsJoker={playsJoker}
            onPlaysJokerChange={setPlaysJoker}
            jokerNumber={jokerNumber}
            onJokerNumberChange={setJokerNumber}
            lines={lines}
            validation={validation}
            onAddLine={() => setLines((current) => [...current, createEmptyLine()])}
            onRemoveLine={(index) =>
              setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))
            }
            onLineChange={handleLineChange}
            receipt={receipt}
            onReceiptChange={setReceipt}
            notes={notes}
            onNotesChange={setNotes}
            selectedDraw={selectedDraw}
            saving={saving}
            submitted={submitted}
            saveSuccess={saveSuccess}
            saveError={saveError}
            onSubmit={handleSubmit}
          />
        </section>

        <aside className="animate-fade-up flex w-full flex-col gap-4 self-start lg:sticky lg:top-12 lg:max-w-md">
          <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
            <h3 className="text-lg font-semibold text-slate-900">Resumen</h3>
            <p className="mt-1 text-sm text-slate-500">
              Vista rapida antes de guardar.
            </p>

            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Sorteo
                </span>
                <p className="mt-1 font-semibold text-slate-900">
                  {selectedDraw?.label ??
                    (selectedDraw
                      ? DRAW_TYPES.find((item) => item.id === selectedDraw.type)
                          ?.label
                      : "Sin definir")}
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Grupo
                </span>
                <p className="mt-1 font-semibold text-slate-900">
                  {groups.find((group) => group.id === groupId)?.name ??
                    "Sin definir"}
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Bote grupo
                </span>
                <p className="mt-1 font-semibold text-slate-900">
                  {groupId ? formatPrice(selectedGroupBalanceCents) : "Sin definir"}
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Fecha
                </span>
                <p className="mt-1 font-semibold text-slate-900">
                  {selectedDraw?.drawDate
                    ? new Date(selectedDraw.drawDate).toLocaleDateString("es-ES")
                    : "Sin definir"}
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Precio
                </span>
                <p className="mt-1 font-semibold text-slate-900">
                  {(() => {
                    if (!priceInput.trim()) return "Sin definir";
                    const parsed = Number.parseFloat(
                      priceInput.replace(",", ".")
                    );
                    return Number.isNaN(parsed)
                      ? "Precio invalido"
                      : `${parsed.toFixed(2)} EUR`;
                  })()}
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Joker
                </span>
                <p className="mt-1 font-semibold text-slate-900">
                  {drawType === "PRIMITIVA"
                    ? playsJoker
                      ? jokerNumber || "Pendiente"
                      : "No"
                    : "No aplica"}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {validation.lineResults.map((line, index) => (
                <div
                  key={index}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-white"
                >
                  <p className="text-xs uppercase tracking-wide text-white/60">
                    Linea {index + 1}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {line.main.length ? (
                      line.main.map((value, valueIndex) => (
                        <NumberBadge key={`${value}-${valueIndex}`} value={value} className="text-white border-white/30 bg-white/20" />
                      ))
                    ) : (
                      <span className="text-sm text-white/60">
                        Numeros pendientes
                      </span>
                    )}
                  </div>

                  {selectedDrawType === "EUROMILLONES" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {line.stars.length ? (
                        line.stars.map((value, valueIndex) => (
                          <NumberBadge key={`star-${value}-${valueIndex}`} value={value} tone="accent" />
                        ))
                      ) : (
                        <span className="text-sm text-white/60">
                          Estrellas pendientes
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-3 text-xs text-white/70">
                      <span>
                        Complementario: {lines[index]?.complement || "-"}
                      </span>
                      <span>Reintegro: {lines[index]?.reintegro || "-"}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <details className="rounded-3xl border border-white/70 bg-white/90 p-4 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
            <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-wide text-slate-400">
              Bote por grupo
            </summary>
            <div className="mt-3 space-y-2">
              {groups.length > 0 ? (
                groups.map((group) => (
                  <div
                    key={`mobile-${group.id}`}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <span>{group.name}</span>
                    <span className="font-semibold">
                      {formatPrice(group.balanceCents ?? 0)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sin grupos.</p>
              )}
            </div>
          </details>

          <div className="hidden rounded-3xl border border-white/70 bg-white/90 p-6 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur lg:block">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Bote por grupo
            </h4>
            <div className="mt-3 space-y-2">
              {groups.length > 0 ? (
                groups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <span>{group.name}</span>
                    <span className="font-semibold">
                      {formatPrice(group.balanceCents ?? 0)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sin grupos.</p>
              )}
            </div>
          </div>

          <details className="rounded-3xl border border-white/70 bg-white/90 p-4 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
            <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-wide text-slate-400">
              Checklist MVP
            </summary>
            <ul className="mt-3 space-y-2">
              <li>Seleccion sorteo + grupo</li>
              <li>Validaciones por tipo de sorteo</li>
              <li>Alta con multiples lineas</li>
              <li>Resguardo opcional</li>
            </ul>
          </details>

          <div className="hidden rounded-3xl border border-white/70 bg-white/90 p-6 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur lg:block">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Checklist MVP
            </h4>
            <ul className="mt-3 space-y-2">
              <li>Seleccion sorteo + grupo</li>
              <li>Validaciones por tipo de sorteo</li>
              <li>Alta con multiples lineas</li>
              <li>Resguardo opcional</li>
            </ul>
          </div>

          <RecentTickets
            tickets={latestTickets}
            loading={loadingTickets}
            error={ticketsError}
            copiedTicketId={copiedTicketId}
            onCopy={handleCopy}
            onSelect={setSelectedTicket}
          />
        </aside>
      </main>
      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </div>
  );
}
