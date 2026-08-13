"use client";

import { useEffect, useState } from "react";

import { CreateSidebar } from "@/components/create/create-sidebar";
import { TicketCreateForm } from "@/components/create/ticket-create-form";
import { TicketDetailModal } from "@/components/tickets/ticket-detail-modal";
import { buildDrawLabel } from "@/features/tickets/formatters";
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
    advancedOpen,
    setAdvancedOpen,
    receiptRetry,
    submitted,
    saving,
    saveError,
    saveSuccess,
    validation,
    selectedDraw,
    handleLineChange,
    handleSubmit,
    retryReceiptUpload,
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

  const latestTickets = tickets.slice(0, 5);
  const selectedGroupBalanceCents =
    groups.find((group) => group.id === groupId)?.balanceCents ?? null;

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
    <div className="relative min-h-[100dvh] bg-transparent text-slate-900">
      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6 md:px-8 lg:flex-row lg:gap-10 lg:px-10 lg:pt-10">
        <section className="flex flex-1 flex-col gap-6">
          <header className="animate-fade-up space-y-3 border-b border-base-300 pb-5 sm:pb-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
              Nuevo boleto
            </span>
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              Alta rapida para tu grupo de loteria.
            </h1>
            <p className="max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
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
            advancedOpen={advancedOpen}
            onAdvancedToggle={() => setAdvancedOpen((current) => !current)}
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
            receiptRetry={receiptRetry}
            onRetryReceipt={retryReceiptUpload}
            onSubmit={handleSubmit}
          />
        </section>

        <CreateSidebar
          drawType={drawType}
          selectedDraw={selectedDraw}
          groupId={groupId}
          groups={groups}
          selectedGroupBalanceCents={selectedGroupBalanceCents}
          priceInput={priceInput}
          playsJoker={playsJoker}
          jokerNumber={jokerNumber}
          lines={lines}
          validation={validation}
          latestTickets={latestTickets}
          loadingTickets={loadingTickets}
          ticketsError={ticketsError}
          copiedTicketId={copiedTicketId}
          onCopyTicket={handleCopy}
          onSelectTicket={setSelectedTicket}
        />

      </main>

      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </div>
  );
}
