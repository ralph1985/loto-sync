"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { loadGroupsAndTickets } from "@/features/tickets/data";
import type { DrawType, Group, GroupMovement, MovementType, Ticket, TicketStatus } from "@/features/tickets/types";

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

const ARCHIVED_PAGE_SIZE = 2;
const REVIEW_GROUP_STORAGE_KEY = "loto-review-group";

type UseReviewDataOptions = {
  setSelectedTicket: Dispatch<SetStateAction<Ticket | null>>;
};

export function useReviewData({ setSelectedTicket }: UseReviewDataOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | TicketStatus>("ALL");
  const [groupFilter, setGroupFilter] = useState("ALL");
  const [drawTypeFilter, setDrawTypeFilter] = useState<"ALL" | DrawType>("ALL");
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [expandedTickets, setExpandedTickets] = useState<Record<string, boolean>>({});
  const [movementTypeFilter, setMovementTypeFilter] = useState<"ALL" | MovementType>("ALL");
  const [groupMovements, setGroupMovements] = useState<GroupMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);
  const [archivedVisibleCount, setArchivedVisibleCount] = useState(0);

  const loadData = useCallback(async (forceRefresh = false) => {
    const { groups: nextGroups, tickets: nextTickets } = await loadGroupsAndTickets(forceRefresh);
    setTickets(nextTickets);
    setSelectedTicket((current) =>
      current ? nextTickets.find((ticket) => ticket.id === current.id) ?? null : current
    );
    setGroups(nextGroups);
  }, [setSelectedTicket]);

  useEffect(() => {
    let isActive = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await loadData();
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los boletos.");
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
    const status = searchParams.get("status");
    const group = searchParams.get("group");
    const drawType = searchParams.get("drawType");
    const rememberedGroup = typeof window !== "undefined"
      ? window.localStorage.getItem(REVIEW_GROUP_STORAGE_KEY)
      : null;
    setStatusFilter(
      status && STATUS_OPTIONS.some((option) => option.value === status)
        ? (status as "ALL" | TicketStatus)
        : "ALL"
    );
    setGroupFilter(group ?? rememberedGroup ?? "ALL");
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
    if (next === searchParams.toString()) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [drawTypeFilter, filtersHydrated, groupFilter, pathname, router, searchParams, statusFilter]);

  useEffect(() => {
    if (!filtersHydrated) return;
    if (groupFilter !== "ALL" && !groups.some((group) => group.id === groupFilter)) {
      setGroupFilter("ALL");
      return;
    }
    window.localStorage.setItem(REVIEW_GROUP_STORAGE_KEY, groupFilter);
  }, [filtersHydrated, groupFilter, groups]);

  const filteredTickets = useMemo(
    () =>
      tickets.filter((ticket) => {
        const statusOk = statusFilter === "ALL" || ticket.status === statusFilter;
        const groupOk = groupFilter === "ALL" || ticket.group?.id === groupFilter;
        const drawTypeOk = drawTypeFilter === "ALL" || ticket.draw?.type === drawTypeFilter;
        return statusOk && groupOk && drawTypeOk;
      }),
    [drawTypeFilter, groupFilter, statusFilter, tickets]
  );

  const primaryActiveTicket = useMemo(() => {
    const pending = filteredTickets.find((ticket) => ticket.status === "PENDIENTE");
    return pending ?? filteredTickets[0] ?? null;
  }, [filteredTickets]);
  const secondaryTickets = useMemo(
    () => filteredTickets.filter((ticket) => ticket.id !== primaryActiveTicket?.id),
    [filteredTickets, primaryActiveTicket]
  );
  const secondaryVisibleTickets = useMemo(
    () => secondaryTickets.slice(0, archivedVisibleCount),
    [archivedVisibleCount, secondaryTickets]
  );
  const visibleTickets = useMemo(
    () => (primaryActiveTicket ? [primaryActiveTicket, ...secondaryVisibleTickets] : secondaryVisibleTickets),
    [primaryActiveTicket, secondaryVisibleTickets]
  );
  const selectedGroupBalanceCents = useMemo(
    () => (groupFilter === "ALL" ? null : groups.find((group) => group.id === groupFilter)?.balanceCents ?? null),
    [groupFilter, groups]
  );
  const hasMoreSecondaryTickets = archivedVisibleCount < secondaryTickets.length;

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
        if (!response.ok) throw new Error(payload?.error || "No se pudo cargar historial de bote.");
        setGroupMovements(payload.data ?? []);
      } catch (movementLoadError) {
        if (movementLoadError instanceof DOMException && movementLoadError.name === "AbortError") {
          aborted = true;
          return;
        }
        setMovementsError(
          movementLoadError instanceof Error ? movementLoadError.message : "No se pudo cargar historial de bote."
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
      return;
    }
    const controller = new AbortController();
    loadMovements({ signal: controller.signal });
    return () => controller.abort();
  }, [groupFilter, loadMovements, tickets]);

  useEffect(() => {
    setArchivedVisibleCount(0);
  }, [drawTypeFilter, groupFilter, statusFilter, tickets]);

  const activeTicketId = primaryActiveTicket?.id ?? null;
  useEffect(() => {
    setExpandedTickets(activeTicketId ? { [activeTicketId]: true } : {});
  }, [activeTicketId]);

  const handleRefreshData = useCallback(async () => {
    setError(null);
    try {
      await loadData(true);
      await loadMovements();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "No se pudieron actualizar los datos.");
    }
  }, [loadData, loadMovements]);

  return {
    tickets,
    groups,
    loading,
    error,
    setError,
    statusFilter,
    setStatusFilter,
    groupFilter,
    setGroupFilter,
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
    archivedPageSize: ARCHIVED_PAGE_SIZE,
  };
}
