"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { ContributionModal } from "@/components/review/contribution-modal";
import { DashboardSummary } from "@/components/review/dashboard-summary";
import { GroupTabs } from "@/components/review/group-tabs";
import { MovementsModal } from "@/components/review/movements-modal";
import { RecentResults } from "@/components/review/recent-results";
import { ReviewFilters } from "@/components/review/review-filters";
import { TicketReviewList } from "@/components/review/ticket-review-list";
import { TicketReviewModal } from "@/components/review/ticket-review-modal";
import { formatPrice } from "@/features/tickets/formatters";
import { buildDisplayedResults, getRecentResults, loadStoredResults, type StoredResult } from "@/features/results/data";
import type { GroupMovement, Ticket } from "@/features/tickets/types";
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
    elMillionCodeInputs,
    setElMillionCodeInputs,
    handleConfirmPurchase,
  } = useReviewTicketActions({ selectedTicket, setSelectedTicket, loadData });

  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [contributionAmountInput, setContributionAmountInput] = useState("");
  const [contributionNoteInput, setContributionNoteInput] = useState("");
  const [savingContribution, setSavingContribution] = useState(false);
  const [contributionError, setContributionError] = useState<string | null>(null);

  const handleGroupChange = useCallback((nextGroupId: string) => {
    setSelectedTicket(null);
    setShowMovementsModal(false);
    setShowContributionModal(false);
    setGroupFilter(nextGroupId);
  }, [setGroupFilter]);

  useEffect(() => {
    if (!selectedGroup || selectedGroup.balanceTrackingEnabled === false) {
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
    if (!selectedGroup) return;
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
    selectedGroup,
    loadData,
    loadMovements,
    setMovementTypeFilter,
  ]);

  const handleRefreshDashboard = useCallback(async () => {
    await Promise.all([handleRefreshData(), loadDashboardResults(true)]);
  }, [handleRefreshData, loadDashboardResults]);

  return (
    <div className="relative min-h-[100dvh] bg-transparent text-slate-900">
      <GroupTabs groups={groups} activeGroupId={groupFilter} onChange={handleGroupChange} />

      <main
        id="group-panel"
        role="tabpanel"
        aria-labelledby={selectedGroup ? `group-tab-${selectedGroup.id}` : undefined}
        aria-label={selectedGroup ? undefined : "Panel de grupos"}
        className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-16 pt-7 md:px-10 md:pt-10"
      >
        {!loading && error && groups.length === 0 ? (
          <section className="rounded-2xl border border-error/30 bg-error/5 p-6" aria-labelledby="groups-error-title">
            <h1 id="groups-error-title" className="text-2xl font-bold text-base-content">No pudimos cargar tus grupos</h1>
            <p className="mt-2 text-sm text-base-content/65">{error}</p>
            <button type="button" onClick={handleRefreshDashboard} className="btn btn-primary btn-sm mt-5">Reintentar</button>
          </section>
        ) : !loading && groups.length === 0 ? (
          <section className="rounded-2xl border border-base-300 bg-base-100 p-6" aria-labelledby="empty-groups-title">
            <h1 id="empty-groups-title" className="text-2xl font-bold text-base-content">No hay grupos disponibles</h1>
            <p className="mt-2 text-sm text-base-content/65">Tu cuenta todavía no pertenece a ningún grupo.</p>
          </section>
        ) : !selectedGroup ? (
          <PanelSkeleton />
        ) : (
          <>
            <DashboardSummary
              group={selectedGroup}
              tickets={tickets}
              missingResultsCount={missingResultsCount}
              onRefresh={handleRefreshDashboard}
              onOpenContribution={openContributionModal}
              onOpenMovements={() => setShowMovementsModal(true)}
            />

            <section aria-labelledby="dashboard-tickets-title">
              <div className="mb-5">
                <h2 id="dashboard-tickets-title" className="text-2xl font-bold tracking-tight text-base-content">Boletos</h2>
                <p className="mt-1 text-sm text-base-content/60">Filtra, compara y revisa las apuestas de {selectedGroup.name}.</p>
              </div>
              <ReviewFilters
                statusFilter={statusFilter}
                drawTypeFilter={drawTypeFilter}
                onStatusChange={setStatusFilter}
                onDrawTypeChange={setDrawTypeFilter}
              />
              <div className="mt-5">
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
            </section>

            <div className={`grid gap-6 ${selectedGroup.balanceTrackingEnabled !== false ? "xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]" : ""}`}>
              <section aria-labelledby="dashboard-results-title" className="rounded-2xl border border-base-300 bg-base-100 p-4 sm:p-5">
                <div className="mb-5">
                  <h2 id="dashboard-results-title" className="text-xl font-bold text-base-content">Resultados recientes</h2>
                  <p className="mt-1 text-sm text-base-content/60">Los tres últimos sorteos de cada juego.</p>
                </div>
                <RecentResults results={recentResults} loading={loadingResults} error={resultsError} />
              </section>

              {selectedGroup.balanceTrackingEnabled !== false ? (
                <MovementsPreview
                  movements={groupMovements}
                  loading={loadingMovements}
                  error={movementsError}
                  onOpenAll={() => setShowMovementsModal(true)}
                />
              ) : null}
            </div>
          </>
        )}
      </main>

      {showContributionModal && selectedGroup && selectedGroup.balanceTrackingEnabled !== false ? (
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

      {showMovementsModal && selectedGroup && selectedGroup.balanceTrackingEnabled !== false ? (
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
        elMillionCodeInputs={elMillionCodeInputs}
        onElMillionCodeChange={(index, value) => setElMillionCodeInputs((current) => current.map((code, codeIndex) => codeIndex === index ? value : code))}
        onConfirmPurchase={handleConfirmPurchase}
      />
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-8" aria-label="Cargando panel">
      <div className="animate-pulse border-b border-base-300 pb-7">
        <div className="h-5 w-28 rounded bg-base-300" />
        <div className="mt-3 h-10 w-64 rounded bg-base-300" />
        <div className="mt-7 h-24 rounded-2xl bg-base-300" />
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-base-300" />
    </div>
  );
}

function MovementsPreview({
  movements,
  loading,
  error,
  onOpenAll,
}: {
  movements: GroupMovement[];
  loading: boolean;
  error: string | null;
  onOpenAll: () => void;
}) {
  return (
    <section aria-labelledby="dashboard-accounting-title" className="rounded-2xl border border-base-300 bg-base-100 p-4 sm:p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 id="dashboard-accounting-title" className="text-xl font-bold text-base-content">Últimos movimientos</h2>
          <p className="mt-1 text-sm text-base-content/60">Actividad reciente del bote.</p>
        </div>
        <button type="button" onClick={onOpenAll} className="shrink-0 text-sm font-semibold text-primary hover:underline">Ver todos</button>
      </div>
      {loading ? (
        <div className="space-y-3" aria-label="Cargando movimientos">
          {[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-base-300" />)}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-error/30 bg-error/5 px-3 py-3 text-sm text-error">{error}</p>
      ) : movements.length === 0 ? (
        <p className="text-sm text-base-content/65">Todavía no hay movimientos para este grupo.</p>
      ) : (
        <div className="divide-y divide-base-300">
          {movements.slice(0, 5).map((movement) => (
            <div key={movement.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-base-content">{movement.note || movement.type}</span>
                <span className="block text-xs text-base-content/60">{new Date(movement.occurredAt).toLocaleDateString("es-ES")}</span>
              </span>
              <span className={movement.amountCents >= 0 ? "shrink-0 font-bold text-success" : "shrink-0 font-bold text-error"}>{formatPrice(movement.amountCents)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-slate-500">Cargando...</div>}>
      <ReviewPageContent />
    </Suspense>
  );
}
