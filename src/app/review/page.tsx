"use client";
import { Suspense, useCallback, useEffect, useState } from "react";

import { ContributionModal } from "@/components/review/contribution-modal";
import { MovementsModal } from "@/components/review/movements-modal";
import { ReviewFilters } from "@/components/review/review-filters";
import { TicketReviewList } from "@/components/review/ticket-review-list";
import { TicketReviewModal } from "@/components/review/ticket-review-modal";
import { formatPrice } from "@/features/tickets/formatters";
import type { Ticket } from "@/features/tickets/types";
import { useReviewData } from "@/hooks/use-review-data";
import { useReviewTicketActions } from "@/hooks/use-review-ticket-actions";

const parseEuroAmountToCents = (value: string) => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
};

function ReviewPageContent() {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const {
    groups,
    loading,
    error,
    groupFilter,
    setGroupFilter,
    statusFilter,
    setStatusFilter,
    drawTypeFilter,
    setDrawTypeFilter,
    filteredTickets,
    secondaryTickets,
    visibleTickets,
    activeTicketId,
    expandedTickets,
    setExpandedTickets,
    hasMoreSecondaryTickets,
    setArchivedVisibleCount,
    selectedGroupBalanceCents,
    loadData,
    handleRefreshData,
    movementTypeFilter,
    setMovementTypeFilter,
    groupMovements,
    loadingMovements,
    movementsError,
    loadMovements,
    archivedPageSize,
  } = useReviewData({ setSelectedTicket });

  const {
    verifying,
    rechecking,
    verifyError,
    verifyResult,
    setVerifyResult,
    setVerifyError,
    checkDrawDate,
    setCheckDrawDate,
    manualPrizeInput,
    setManualPrizeInput,
    savingPrize,
    prizeError,
    editingTicket,
    editTicketError,
    editDrawDate,
    setEditDrawDate,
    editPrimitivaCoverageMode,
    setEditPrimitivaCoverageMode,
    weeklyDrawDates,
    handleSaveTicketDrawScope,
    handleVerifyTicket,
    handleRecheckTicket,
    handleSaveManualPrize,
    winningMainNumbers,
    winningStars,
  } = useReviewTicketActions({ selectedTicket, setSelectedTicket, loadData });

  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [contributionAmountInput, setContributionAmountInput] = useState("");
  const [contributionNoteInput, setContributionNoteInput] = useState("");
  const [savingContribution, setSavingContribution] = useState(false);
  const [contributionError, setContributionError] = useState<string | null>(null);

  useEffect(() => {
    if (groupFilter === "ALL") {
      setShowMovementsModal(false);
      setShowContributionModal(false);
    }
  }, [groupFilter]);
  const openContributionModal = useCallback(() => {
    setContributionAmountInput("");
    setContributionNoteInput("");
    setContributionError(null);
    setShowContributionModal(true);
  }, []);

  const closeContributionModal = useCallback(() => {
    if (savingContribution) return;
    setShowContributionModal(false);
    setContributionAmountInput("");
    setContributionNoteInput("");
    setContributionError(null);
  }, [savingContribution]);

  const handleSaveContribution = useCallback(async () => {
    if (groupFilter === "ALL") return;
    const amountCents = parseEuroAmountToCents(contributionAmountInput);
    if (!amountCents) {
      setContributionError("Introduce un importe positivo con maximo 2 decimales.");
      return;
    }

    setSavingContribution(true);
    setContributionError(null);
    try {
      const response = await fetch(`/api/groups/${groupFilter}/movements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountCents,
          note: contributionNoteInput.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo registrar la aportacion.");
      }

      await loadData(true);
      setMovementTypeFilter("ALL");
      await loadMovements({ type: "ALL" });
      closeContributionModal();
    } catch (saveError) {
      setContributionError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo registrar la aportacion."
      );
    } finally {
      setSavingContribution(false);
    }
  }, [
    closeContributionModal,
    contributionAmountInput,
    contributionNoteInput,
    groupFilter,
    loadData,
    loadMovements,
    setMovementTypeFilter,
  ]);

  return (
    <div className="relative min-h-[100dvh] bg-transparent text-slate-900">
      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-8 md:px-10 md:pt-12">
        <header className="flex flex-col gap-2 rounded-3xl border border-white/70 bg-white/85 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
          <div className="space-y-2">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
              Revisión
            </span>
            <h1 className="text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl md:text-4xl">
              Revisión de boletos por grupo
            </h1>
            <p className="max-w-2xl text-sm text-slate-600">
              Resumen compacto arriba y comparativas semanales desplegables por boleto.
            </p>
          </div>
        </header>

        <ReviewFilters
          groups={groups}
          groupFilter={groupFilter}
          statusFilter={statusFilter}
          drawTypeFilter={drawTypeFilter}
          selectedGroupBalanceCents={selectedGroupBalanceCents}
          onGroupChange={setGroupFilter}
          onStatusChange={setStatusFilter}
          onDrawTypeChange={setDrawTypeFilter}
          onRefresh={handleRefreshData}
          onOpenContribution={openContributionModal}
          onOpenMovements={() => setShowMovementsModal(true)}
          formatPrice={formatPrice}
        />

        <TicketReviewList
          error={error}
          loading={loading}
          filteredTickets={filteredTickets}
          visibleTickets={visibleTickets}
          secondaryTickets={secondaryTickets}
          activeTicketId={activeTicketId}
          expandedTickets={expandedTickets}
          hasMoreSecondaryTickets={hasMoreSecondaryTickets}
          onToggleComparisons={(ticketId) => {
            setExpandedTickets((current) => ({
              ...current,
              [ticketId]: !(current[ticketId] ?? false),
            }));
          }}
          onSelectTicket={(ticket) => {
            setSelectedTicket(ticket);
            setVerifyResult(null);
            setVerifyError(null);
          }}
          onShowMore={() =>
            setArchivedVisibleCount((current) =>
              Math.min(current + archivedPageSize, secondaryTickets.length)
            )
          }
        />
      </main>

      {showContributionModal && groupFilter !== "ALL" ? (
        <ContributionModal
          open
          groupName={groups.find((group) => group.id === groupFilter)?.name ?? "Grupo"}
          balanceCents={selectedGroupBalanceCents}
          amount={contributionAmountInput}
          note={contributionNoteInput}
          saving={savingContribution}
          error={contributionError}
          onClose={closeContributionModal}
          onAmountChange={(value) => {
            setContributionAmountInput(value);
            setContributionError(null);
          }}
          onNoteChange={setContributionNoteInput}
          onSubmit={handleSaveContribution}
        />
      ) : null}

      {showMovementsModal && groupFilter !== "ALL" ? (
        <MovementsModal
          open
          groupName={groups.find((group) => group.id === groupFilter)?.name ?? "Grupo"}
          balanceCents={selectedGroupBalanceCents}
          movementTypeFilter={movementTypeFilter}
          movements={groupMovements}
          loading={loadingMovements}
          error={movementsError}
          onClose={() => setShowMovementsModal(false)}
          onFilterChange={setMovementTypeFilter}
        />
      ) : null}

      <TicketReviewModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        editDrawDate={editDrawDate}
        onEditDrawDateChange={setEditDrawDate}
        editCoverageMode={editPrimitivaCoverageMode}
        onEditCoverageModeChange={setEditPrimitivaCoverageMode}
        onSaveDrawScope={handleSaveTicketDrawScope}
        editingTicket={editingTicket}
        editTicketError={editTicketError}
        weeklyDrawDates={weeklyDrawDates}
        checkDrawDate={checkDrawDate}
        onCheckDrawDateChange={setCheckDrawDate}
        onVerify={handleVerifyTicket}
        verifying={verifying}
        onRecheck={handleRecheckTicket}
        rechecking={rechecking}
        verifyError={verifyError}
        verifyResult={verifyResult}
        manualPrizeInput={manualPrizeInput}
        onManualPrizeChange={setManualPrizeInput}
        onSavePrize={handleSaveManualPrize}
        savingPrize={savingPrize}
        prizeError={prizeError}
        winningMainNumbers={winningMainNumbers}
        winningStars={winningStars}
      />
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-slate-500">Cargando...</div>}>
      <ReviewPageContent />
    </Suspense>
  );
}
