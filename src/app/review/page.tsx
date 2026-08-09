"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { ContributionModal } from "@/components/review/contribution-modal";
import { MovementsModal } from "@/components/review/movements-modal";
import { ReviewFilters } from "@/components/review/review-filters";
import { TicketReviewList } from "@/components/review/ticket-review-list";
import { TicketReviewModal } from "@/components/review/ticket-review-modal";
import {
  formatPrice,
} from "@/features/tickets/formatters";
import { sortChecksByDate, toNumberArray } from "@/features/tickets/review-utils";
import type {
  DrawType,
  Group,
  GroupMovement,
  MovementType,
  PrimitivaCoverageMode,
  Ticket,
  TicketCheck,
  TicketStatus,
  VerifyResponse,
} from "@/features/tickets/types";
import {
  API_GROUPS_CACHE_KEY,
  API_TICKETS_CACHE_KEY,
  invalidateApiCache,
  readApiCache,
  writeApiCache,
} from "@/lib/api-cache";

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

const PRIMITIVA_DRAW_WEEKDAYS = new Set([1, 4, 6]);

const toDateInput = (value?: string | null) => {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
};

const parseEuroAmountToCents = (value: string) => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
};

const getPrimitivaWeeklyDrawDates = (drawDate: string) => {
  const source = new Date(`${drawDate}T00:00:00.000Z`);
  if (Number.isNaN(source.getTime())) return [];
  const weekday = source.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(source);
  monday.setUTCDate(source.getUTCDate() + mondayOffset);

  return [0, 3, 5].map((offset) => {
    const value = new Date(monday);
    value.setUTCDate(monday.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  });
};

const inferPrimitivaCoverageMode = (ticket: Ticket) => {
  if (ticket.draw?.type !== "PRIMITIVA") return "SINGLE" as const;
  const drawDate = toDateInput(ticket.draw?.drawDate);
  if (!drawDate) return "SINGLE" as const;
  const expectedWeekly = getPrimitivaWeeklyDrawDates(drawDate);
  const currentDates = sortChecksByDate(ticket.checks)
    .map((check) => toDateInput(check.drawDate))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
  if (
    expectedWeekly.length === currentDates.length &&
    expectedWeekly.every((date, index) => date === currentDates[index])
  ) {
    return "WEEKLY" as const;
  }
  return "SINGLE" as const;
};

function ReviewPageContent() {
  const ARCHIVED_PAGE_SIZE = 2;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"ALL" | TicketStatus>("ALL");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [drawTypeFilter, setDrawTypeFilter] = useState<"ALL" | DrawType>("ALL");
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [expandedTickets, setExpandedTickets] = useState<Record<string, boolean>>({});

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [checkDrawDate, setCheckDrawDate] = useState<string>("");

  const [manualPrizeInput, setManualPrizeInput] = useState<string>("");
  const [savingPrize, setSavingPrize] = useState(false);
  const [prizeError, setPrizeError] = useState<string | null>(null);
  const [editingTicket, setEditingTicket] = useState(false);
  const [editTicketError, setEditTicketError] = useState<string | null>(null);
  const [editDrawDate, setEditDrawDate] = useState<string>("");
  const [editPrimitivaCoverageMode, setEditPrimitivaCoverageMode] =
    useState<PrimitivaCoverageMode>("SINGLE");
  const [movementTypeFilter, setMovementTypeFilter] = useState<"ALL" | MovementType>(
    "ALL"
  );
  const [groupMovements, setGroupMovements] = useState<GroupMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [contributionAmountInput, setContributionAmountInput] = useState("");
  const [contributionNoteInput, setContributionNoteInput] = useState("");
  const [savingContribution, setSavingContribution] = useState(false);
  const [contributionError, setContributionError] = useState<string | null>(null);
  const [archivedVisibleCount, setArchivedVisibleCount] = useState(0);

  const loadData = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      invalidateApiCache(API_TICKETS_CACHE_KEY, API_GROUPS_CACHE_KEY);
    }

    const cachedTickets = readApiCache<Ticket[]>(API_TICKETS_CACHE_KEY, {
      forceRefresh,
    });
    const cachedGroups = readApiCache<Group[]>(API_GROUPS_CACHE_KEY, {
      forceRefresh,
    });
    if (cachedTickets && cachedGroups) {
      setTickets(cachedTickets);
      setSelectedTicket((current) =>
        current
          ? cachedTickets.find((ticket: Ticket) => ticket.id === current.id) ?? null
          : current
      );
      setGroups(cachedGroups);
      return;
    }

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
      current
        ? nextTickets.find((ticket: Ticket) => ticket.id === current.id) ?? null
        : current
    );
    const nextGroups = groupsPayload.data ?? [];
    setGroups(nextGroups);
    writeApiCache(API_TICKETS_CACHE_KEY, nextTickets);
    writeApiCache(API_GROUPS_CACHE_KEY, nextGroups);
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
        if (isActive) setLoading(false);
      }
    };

    load();

    return () => {
      isActive = false;
    };
  }, [loadData]);

  useEffect(() => {
    if (!selectedTicket) {
      setEditDrawDate("");
      setEditPrimitivaCoverageMode("SINGLE");
      setEditTicketError(null);
      return;
    }
    setCheckDrawDate(toDateInput(selectedTicket.draw?.drawDate));
    setManualPrizeInput("");
    setPrizeError(null);
    setEditDrawDate(toDateInput(selectedTicket.draw?.drawDate));
    setEditPrimitivaCoverageMode(inferPrimitivaCoverageMode(selectedTicket));
    setEditTicketError(null);
  }, [selectedTicket]);

  useEffect(() => {
    const status = searchParams.get("status");
    const group = searchParams.get("group");
    const drawType = searchParams.get("drawType");

    setStatusFilter(
      status && STATUS_OPTIONS.some((option) => option.value === status)
        ? (status as "ALL" | TicketStatus)
        : "ALL"
    );
    setGroupFilter(group ?? "ALL");
    setDrawTypeFilter(
      drawType && DRAW_TYPE_OPTIONS.some((option) => option.value === drawType)
        ? (drawType as "ALL" | DrawType)
        : "ALL"
    );
    setFiltersHydrated(true);
  }, [searchParams]);

  useEffect(() => {
    if (!filtersHydrated) return;
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (groupFilter !== "ALL") params.set("group", groupFilter);
    if (drawTypeFilter !== "ALL") params.set("drawType", drawTypeFilter);

    const next = params.toString();
    const current = searchParams.toString();
    if (next === current) return;

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    drawTypeFilter,
    filtersHydrated,
    groupFilter,
    pathname,
    router,
    searchParams,
    statusFilter,
  ]);

  useEffect(() => {
    if (!filtersHydrated) return;
    if (groups.length === 1 && groupFilter === "ALL") {
      setGroupFilter(groups[0].id);
    }
  }, [filtersHydrated, groupFilter, groups]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const statusOk = statusFilter === "ALL" || ticket.status === statusFilter;
      const groupOk = groupFilter === "ALL" || ticket.group?.id === groupFilter;
      const drawTypeOk =
        drawTypeFilter === "ALL" || ticket.draw?.type === drawTypeFilter;
      return statusOk && groupOk && drawTypeOk;
    });
  }, [tickets, statusFilter, groupFilter, drawTypeFilter]);

  const primaryActiveTicket = useMemo(() => {
    const pending = filteredTickets.find((ticket) => ticket.status === "PENDIENTE");
    return pending ?? filteredTickets[0] ?? null;
  }, [filteredTickets]);
  const secondaryTickets = useMemo(
    () =>
      filteredTickets.filter((ticket) =>
        primaryActiveTicket ? ticket.id !== primaryActiveTicket.id : true
      ),
    [filteredTickets, primaryActiveTicket]
  );
  const secondaryVisibleTickets = useMemo(
    () => secondaryTickets.slice(0, archivedVisibleCount),
    [secondaryTickets, archivedVisibleCount]
  );
  const visibleTickets = useMemo(
    () =>
      primaryActiveTicket
        ? [primaryActiveTicket, ...secondaryVisibleTickets]
        : secondaryVisibleTickets,
    [primaryActiveTicket, secondaryVisibleTickets]
  );
  const hasMoreSecondaryTickets = archivedVisibleCount < secondaryTickets.length;

  const selectedGroupBalanceCents = useMemo(() => {
    if (groupFilter === "ALL") return null;
    return groups.find((group) => group.id === groupFilter)?.balanceCents ?? 0;
  }, [groupFilter, groups]);

  const loadMovements = useCallback(
    async (options?: { signal?: AbortSignal; type?: "ALL" | MovementType }) => {
      if (groupFilter === "ALL") {
        setGroupMovements([]);
        setMovementsError(null);
        return;
      }

      setLoadingMovements(true);
      setMovementsError(null);
      let aborted = false;
      try {
        const selectedType = options?.type ?? movementTypeFilter;
        const query = selectedType === "ALL" ? "" : `?type=${selectedType}`;
        const response = await fetch(`/api/groups/${groupFilter}/movements${query}`, {
          signal: options?.signal,
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo cargar historial de bote.");
        }
        setGroupMovements(payload.data ?? []);
      } catch (movementLoadError) {
        if (movementLoadError instanceof DOMException && movementLoadError.name === "AbortError") {
          aborted = true;
          return;
        }
        setMovementsError(
          movementLoadError instanceof Error
            ? movementLoadError.message
            : "No se pudo cargar historial de bote."
        );
      } finally {
        if (!aborted) setLoadingMovements(false);
      }
    },
    [groupFilter, movementTypeFilter]
  );

  useEffect(() => {
    if (groupFilter === "ALL") {
      setGroupMovements([]);
      setMovementsError(null);
      setShowMovementsModal(false);
      setShowContributionModal(false);
      return;
    }

    const controller = new AbortController();
    loadMovements({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [groupFilter, loadMovements, tickets]);

  useEffect(() => {
    setArchivedVisibleCount(0);
  }, [statusFilter, groupFilter, drawTypeFilter, tickets]);

  const activeTicketId = primaryActiveTicket?.id ?? null;

  useEffect(() => {
    if (!activeTicketId) {
      setExpandedTickets({});
      return;
    }
    setExpandedTickets({ [activeTicketId]: true });
  }, [activeTicketId]);

  const activeCheck: TicketCheck | null =
    verifyResult?.check ?? sortChecksByDate(selectedTicket?.checks).at(0) ?? null;

  const winningMainNumbers = useMemo(
    () => new Set(toNumberArray(activeCheck?.winningNumbers)),
    [activeCheck]
  );
  const winningStars = useMemo(
    () => new Set(toNumberArray(activeCheck?.winningStars)),
    [activeCheck]
  );

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

  const handleRefreshData = useCallback(async () => {
    setError(null);
    try {
      await loadData(true);
      await loadMovements();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "No se pudieron actualizar los datos."
      );
    }
  }, [loadData, loadMovements]);

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
  ]);

  const handleSaveTicketDrawScope = useCallback(async () => {
    if (!selectedTicket?.draw) return;
    if (!editDrawDate) {
      setEditTicketError("Selecciona la fecha base del boleto.");
      return;
    }
    const parsedBaseDate = new Date(`${editDrawDate}T00:00:00.000Z`);
    if (Number.isNaN(parsedBaseDate.getTime())) {
      setEditTicketError("La fecha base no es válida.");
      return;
    }
    if (
      selectedTicket.draw.type === "PRIMITIVA" &&
      !PRIMITIVA_DRAW_WEEKDAYS.has(parsedBaseDate.getUTCDay())
    ) {
      setEditTicketError("Primitiva solo admite lunes, jueves o sábado.");
      return;
    }

    setEditingTicket(true);
    setEditTicketError(null);
    try {
      const drawDates =
        selectedTicket.draw.type === "PRIMITIVA" && editPrimitivaCoverageMode === "WEEKLY"
          ? getPrimitivaWeeklyDrawDates(editDrawDate)
          : [editDrawDate];
      const response = await fetch("/api/tickets", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          drawDate: editDrawDate,
          drawDates,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const issues = Array.isArray(payload?.issues) ? payload.issues.join(" ") : null;
        throw new Error(issues || payload?.error || "No se pudo actualizar el boleto.");
      }
      setSelectedTicket(payload.data ?? null);
      setCheckDrawDate(editDrawDate);
      await loadData(true);
    } catch (error) {
      setEditTicketError(
        error instanceof Error ? error.message : "No se pudo actualizar el boleto."
      );
    } finally {
      setEditingTicket(false);
    }
  }, [editDrawDate, editPrimitivaCoverageMode, loadData, selectedTicket]);

  const handleVerifyTicket = useCallback(async () => {
    if (!selectedTicket) return;
    setVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const query = new URLSearchParams({ ticketId: selectedTicket.id });
      if (checkDrawDate) query.set("drawDate", checkDrawDate);
      const response = await fetch(`/api/results/verify?${query.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Error al comprobar.");
      setVerifyResult(payload.data);
      await loadData(true);
    } catch (verifyLoadError) {
      setVerifyError(
        verifyLoadError instanceof Error ? verifyLoadError.message : "Error al comprobar."
      );
    } finally {
      setVerifying(false);
    }
  }, [checkDrawDate, loadData, selectedTicket]);

  const handleRecheckTicket = useCallback(async () => {
    if (!selectedTicket) return;
    setRechecking(true);
    setVerifyError(null);
    try {
      const response = await fetch("/api/results/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: selectedTicket.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "No se pudo recomprobar.");
      await loadData(true);
    } catch (recheckError) {
      setVerifyError(
        recheckError instanceof Error
          ? recheckError.message
          : "No se pudo recomprobar."
      );
    } finally {
      setRechecking(false);
    }
  }, [loadData, selectedTicket]);

  const handleSaveManualPrize = useCallback(async () => {
    if (!selectedTicket) return;
    setPrizeError(null);
    const parsed = Number.parseFloat(manualPrizeInput.replace(",", "."));
    if (Number.isNaN(parsed) || parsed < 0) {
      setPrizeError("Introduce un importe válido.");
      return;
    }

    setSavingPrize(true);
    try {
      const response = await fetch("/api/results/prize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          drawDate: checkDrawDate || undefined,
          prizeCents: Math.round(parsed * 100),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "No se pudo guardar.");
      await loadData(true);
    } catch (prizeSaveError) {
      setPrizeError(
        prizeSaveError instanceof Error ? prizeSaveError.message : "No se pudo guardar."
      );
    } finally {
      setSavingPrize(false);
    }
  }, [checkDrawDate, loadData, manualPrizeInput, selectedTicket]);

  return (
    <div className="relative min-h-screen bg-[#f7f2ea] text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-[#f9c784]/50 blur-3xl animate-glow" />
        <div className="absolute right-[-120px] top-48 h-96 w-96 rounded-full bg-[#9bb7ff]/35 blur-3xl animate-glow" />
        <div className="absolute bottom-[-160px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#f5a1b0]/30 blur-[120px]" />
      </div>

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
              Math.min(current + ARCHIVED_PAGE_SIZE, secondaryTickets.length)
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
        weeklyDrawDates={getPrimitivaWeeklyDrawDates}
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
