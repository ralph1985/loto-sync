"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { ContributionModal } from "@/components/review/contribution-modal";
import { DashboardSection } from "@/components/review/dashboard-section";
import { DashboardSummary } from "@/components/review/dashboard-summary";
import { MovementsModal } from "@/components/review/movements-modal";
import { RecentResults } from "@/components/review/recent-results";
import { RecurringTicketsPanel } from "@/components/review/recurring-tickets-panel";
import { ReviewFilters } from "@/components/review/review-filters";
import { TicketReviewList } from "@/components/review/ticket-review-list";
import { TicketReviewModal } from "@/components/review/ticket-review-modal";
import { formatPrice } from "@/features/tickets/formatters";
import { buildDisplayedResults, getRecentResults, loadStoredResults, type StoredResult } from "@/features/results/data";
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
    tickets,
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

  const [openSection, setOpenSection] = useState<"tickets" | "results" | "accounting">("tickets");
  const [storedResults, setStoredResults] = useState<StoredResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(true);
  const [resultsError, setResultsError] = useState<string | null>(null);

  const loadDashboardResults = useCallback(async (forceRefresh = false) => {
    setLoadingResults(true);
    setResultsError(null);
    try {
      setStoredResults(await loadStoredResults("ALL", forceRefresh));
    } catch (loadError) {
      setResultsError(loadError instanceof Error ? loadError.message : "No se pudieron cargar resultados.");
    } finally {
      setLoadingResults(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardResults();
  }, [loadDashboardResults]);

  const recentResults = useMemo(
    () => [
      ...getRecentResults(storedResults, "PRIMITIVA"),
      ...getRecentResults(storedResults, "EUROMILLONES"),
    ],
    [storedResults]
  );
  const selectedGroup = groups.find((group) => group.id === groupFilter);
  const missingResultsCount = useMemo(
    () => buildDisplayedResults(storedResults, "ALL").filter((result) => result.isMissing).length,
    [storedResults]
  );

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
    confirmingPurchase,
    purchaseError,
    elMillionCodeInput,
    setElMillionCodeInput,
    handleConfirmPurchase,
  } = useReviewTicketActions({ selectedTicket, setSelectedTicket, loadData });

  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [contributionAmountInput, setContributionAmountInput] = useState("");
  const [contributionNoteInput, setContributionNoteInput] = useState("");
  const [savingContribution, setSavingContribution] = useState(false);
  const [contributionError, setContributionError] = useState<string | null>(null);

  useEffect(() => {
    if (groupFilter === "ALL" || selectedGroup?.balanceTrackingEnabled === false) {
      setShowMovementsModal(false);
      setShowContributionModal(false);
    }
  }, [groupFilter, selectedGroup]);
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

  const handleRefreshDashboard = useCallback(async () => {
    await Promise.all([handleRefreshData(), loadDashboardResults(true)]);
  }, [handleRefreshData, loadDashboardResults]);

  return (
    <div className="relative min-h-[100dvh] bg-transparent text-slate-900">
      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-8 md:px-10 md:pt-12">
        <header className="flex flex-col gap-2 border-b border-base-300 pb-5 sm:pb-6">
          <div className="space-y-2">
            <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
              Panel operativo
            </span>
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
              Boletos y resultados en un solo lugar
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Detecta premios, pendientes y sorteos faltantes antes de entrar al detalle.
            </p>
          </div>
        </header>

        <DashboardSummary
          groups={groups}
          tickets={tickets}
          groupFilter={groupFilter}
          missingResultsCount={missingResultsCount}
          onGroupChange={setGroupFilter}
          onRefresh={handleRefreshDashboard}
          onOpenContribution={openContributionModal}
          onOpenMovements={() => setShowMovementsModal(true)}
        />

        <RecurringTicketsPanel groups={groups} />

        <div className="flex flex-col gap-4">
          <DashboardSection
            id="dashboard-tickets"
            title="Boletos"
            description="Filtra, compara y revisa cada apuesta."
            open={openSection === "tickets"}
            onToggle={() => setOpenSection("tickets")}
          >
            <ReviewFilters
              statusFilter={statusFilter}
              drawTypeFilter={drawTypeFilter}
              onStatusChange={setStatusFilter}
              onDrawTypeChange={setDrawTypeFilter}
              onRefresh={handleRefreshDashboard}
            />
            <div className="mt-4">
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
            </div>
          </DashboardSection>

          <DashboardSection
            id="dashboard-results"
            title="Resultados recientes"
            description="Los tres últimos sorteos de cada juego."
            open={openSection === "results"}
            onToggle={() => setOpenSection("results")}
          >
            <RecentResults results={recentResults} loading={loadingResults} error={resultsError} />
          </DashboardSection>

          {groupFilter !== "ALL" && selectedGroup?.balanceTrackingEnabled !== false ? <DashboardSection
            id="dashboard-accounting"
            title="Saldo y movimientos"
            description="Consulta la actividad económica del grupo seleccionado."
            open={openSection === "accounting"}
            onToggle={() => setOpenSection("accounting")}
          >
            {groupFilter === "ALL" ? (
              <p className="text-sm text-base-content/70">Selecciona un grupo arriba para consultar sus movimientos.</p>
            ) : loadingMovements ? (
              <p className="text-sm text-base-content/70">Cargando movimientos...</p>
            ) : movementsError ? (
              <p className="rounded-2xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{movementsError}</p>
            ) : groupMovements.length === 0 ? (
              <p className="text-sm text-base-content/70">Todavía no hay movimientos para este grupo.</p>
            ) : (
              <div className="space-y-2">
                {groupMovements.slice(0, 5).map((movement) => (
                  <div key={movement.id} className="flex items-center justify-between gap-3 rounded-2xl border border-base-300 px-3 py-3 text-sm">
                    <span><span className="block font-semibold text-base-content">{movement.note || movement.type}</span><span className="block text-xs text-base-content/60">{new Date(movement.occurredAt).toLocaleDateString("es-ES")}</span></span>
                    <span className={movement.amountCents >= 0 ? "font-bold text-success" : "font-bold text-error"}>{formatPrice(movement.amountCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </DashboardSection> : null}
        </div>
      </main>

      {showContributionModal && groupFilter !== "ALL" && selectedGroup?.balanceTrackingEnabled !== false ? (
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

      {showMovementsModal && groupFilter !== "ALL" && selectedGroup?.balanceTrackingEnabled !== false ? (
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
        confirmingPurchase={confirmingPurchase}
        purchaseError={purchaseError}
        elMillionCodeInput={elMillionCodeInput}
        onElMillionCodeChange={setElMillionCodeInput}
        onConfirmPurchase={handleConfirmPurchase}
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
