"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

type DrawType = "PRIMITIVA" | "EUROMILLONES";
type TicketStatus = "PENDIENTE" | "COMPROBADO" | "PREMIO";
type PrimitivaCoverageMode = "SINGLE" | "WEEKLY";
type MovementType =
  | "OPENING"
  | "ADJUSTMENT"
  | "CONTRIBUTION"
  | "TICKET_EXPENSE"
  | "PRIZE";

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

type TicketCheck = {
  id: string;
  drawDate: string;
  status: TicketStatus;
  reason?: string | null;
  winningNumbers?: number[] | null;
  winningStars?: number[] | null;
  winningComplementario?: number | null;
  winningReintegro?: number | null;
  matchesMain: number;
  matchesStars: number;
  prizeCents?: number | null;
  prizeSource?: string | null;
  checkedAt: string;
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

type GroupMovement = {
  id: string;
  type: MovementType;
  amountCents: number;
  occurredAt: string;
  note?: string | null;
  runningBalanceCents: number;
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

const MOVEMENT_TYPE_OPTIONS: { value: "ALL" | MovementType; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "OPENING", label: "Saldo inicial" },
  { value: "CONTRIBUTION", label: "Aportación" },
  { value: "TICKET_EXPENSE", label: "Gasto boleto" },
  { value: "PRIZE", label: "Premio" },
  { value: "ADJUSTMENT", label: "Ajuste" },
];

const DRAW_LABELS: Record<DrawType, string> = {
  PRIMITIVA: "Primitiva",
  EUROMILLONES: "Euromillones",
};

const REVIEW_CACHE_TTL_MS = 60 * 60 * 1000;
const REVIEW_TICKETS_CACHE_KEY = "review:api:tickets";
const REVIEW_GROUPS_CACHE_KEY = "review:api:groups";
const PRIMITIVA_DRAW_WEEKDAYS = new Set([1, 4, 6]);

const formatDate = (value?: string | null) => {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleDateString("es-ES");
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleString("es-ES");
};

const formatDrawChip = (value?: string | null) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  const weekday = date.toLocaleDateString("es-ES", { weekday: "short" });
  const day = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
  });
  return `${weekday.replace(".", "")} ${day}`;
};

const toDateInput = (value?: string | null) => {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
};

const formatPrice = (priceCents?: number | null) => {
  if (priceCents === null || priceCents === undefined) return "Sin precio";
  return `${(priceCents / 100).toFixed(2)} EUR`;
};

const toNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "number"
        ? item
        : typeof item === "string"
        ? Number.parseInt(item, 10)
        : NaN
    )
    .filter((item) => Number.isFinite(item));
};

const buildDrawLabel = (draw?: Draw | null) => {
  if (!draw) return "Sorteo";
  return draw.label ?? `${DRAW_LABELS[draw.type]} · ${formatDate(draw.drawDate)}`;
};

const sortChecksByDate = (checks?: TicketCheck[]) =>
  [...(checks ?? [])].sort(
    (a, b) => new Date(b.drawDate).getTime() - new Date(a.drawDate).getTime()
  );

const getMainNumbers = (line?: TicketLine) =>
  line
    ? line.numbers
        .filter((number) => number.kind === "MAIN")
        .sort((a, b) => a.position - b.position)
        .map((number) => number.value)
    : [];

const getStarNumbers = (line?: TicketLine) =>
  line
    ? line.numbers
        .filter((number) => number.kind === "STAR")
        .sort((a, b) => a.position - b.position)
        .map((number) => number.value)
    : [];

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
  const [archivedVisibleCount, setArchivedVisibleCount] = useState(0);

  const loadData = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    const readCache = <T,>(key: string): T | null => {
      if (forceRefresh || typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as { cachedAt?: number; data?: T };
        if (
          typeof parsed.cachedAt === "number" &&
          now - parsed.cachedAt < REVIEW_CACHE_TTL_MS &&
          parsed.data !== undefined
        ) {
          return parsed.data;
        }
      } catch {
        window.localStorage.removeItem(key);
      }
      return null;
    };

    const writeCache = <T,>(key: string, data: T) => {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(
        key,
        JSON.stringify({
          cachedAt: Date.now(),
          data,
        })
      );
    };

    const cachedTickets = readCache<Ticket[]>(REVIEW_TICKETS_CACHE_KEY);
    const cachedGroups = readCache<Group[]>(REVIEW_GROUPS_CACHE_KEY);
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
    writeCache(REVIEW_TICKETS_CACHE_KEY, nextTickets);
    writeCache(REVIEW_GROUPS_CACHE_KEY, nextGroups);
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

  useEffect(() => {
    if (groupFilter === "ALL") {
      setGroupMovements([]);
      setMovementsError(null);
      setShowMovementsModal(false);
      return;
    }

    let isActive = true;
    const loadMovements = async () => {
      setLoadingMovements(true);
      setMovementsError(null);
      try {
        const query =
          movementTypeFilter === "ALL" ? "" : `?type=${movementTypeFilter}`;
        const response = await fetch(`/api/groups/${groupFilter}/movements${query}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo cargar historial de bote.");
        }
        if (!isActive) return;
        setGroupMovements(payload.data ?? []);
      } catch (movementLoadError) {
        if (!isActive) return;
        setMovementsError(
          movementLoadError instanceof Error
            ? movementLoadError.message
            : "No se pudo cargar historial de bote."
        );
      } finally {
        if (isActive) setLoadingMovements(false);
      }
    };

    loadMovements();
    return () => {
      isActive = false;
    };
  }, [groupFilter, movementTypeFilter, tickets]);

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

        <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="grid gap-3 md:grid-cols-4">
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
                  setStatusFilter(event.target.value as "ALL" | TicketStatus)
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

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bote
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {groupFilter === "ALL"
                  ? "Selecciona grupo"
                  : formatPrice(selectedGroupBalanceCents)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => loadData(true)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                >
                  Recargar
                </button>
                {groupFilter !== "ALL" ? (
                  <button
                    type="button"
                    onClick={() => setShowMovementsModal(true)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                  >
                    Ver historial
                  </button>
                ) : null}
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
          ) : visibleTickets.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-6 text-sm text-slate-500">
              No hay apuestas para mostrar.
            </div>
          ) : (
            visibleTickets.map((ticket) => {
              const firstLine = ticket.lines?.[0];
              const mainNumbers = getMainNumbers(firstLine);
              const stars = getStarNumbers(firstLine);
              const reintegro = firstLine?.reintegro ?? null;
              const checksSorted = sortChecksByDate(ticket.checks);
              const isComparativesExpanded = expandedTickets[ticket.id] ?? false;
              const isActiveTicket = ticket.id === activeTicketId;
              const totalPrizeCents = checksSorted.reduce(
                (sum, check) => sum + (check.prizeCents ?? 0),
                0
              );

              return (
                <article
                  key={ticket.id}
                  className={`rounded-3xl border bg-white/95 p-3 shadow-[0_16px_44px_rgba(15,23,42,0.08)] sm:p-4 ${
                    isActiveTicket ? "border-emerald-300" : "border-white/70"
                  }`}
                >
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                          {ticket.group?.name ?? "Grupo"}
                        </span>
                        {isActiveTicket ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                            Activo
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-3 py-1 ${
                            ticket.status === "PREMIO"
                              ? "bg-emerald-100 text-emerald-700"
                              : ticket.status === "COMPROBADO"
                              ? "bg-sky-100 text-sky-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {ticket.status}
                        </span>
                        {ticket.receipt?.blobUrl ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                            Resguardo
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                            Sin resguardo
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="text-xl font-semibold text-slate-900">
                          {buildDrawLabel(ticket.draw)}
                        </h3>
                        <p className="text-sm text-slate-500">
                          Alta: {formatDateTime(ticket.createdAt)}
                        </p>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Precio
                          </p>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatPrice(ticket.priceCents)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Premio acumulado
                          </p>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatPrice(totalPrizeCents)}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Números apostados
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
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
                            <span className="text-xs text-slate-400">Sin números</span>
                          )}
                          {stars.map((value, index) => (
                            <span
                              key={`${ticket.id}-star-${index}`}
                              className="rounded-full bg-[#f9c784] px-3 py-1 text-xs font-semibold text-slate-900"
                            >
                              {value}
                            </span>
                          ))}
                          {ticket.draw?.type === "PRIMITIVA" ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                              R {reintegro ?? "-"}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTickets((current) => ({
                              ...current,
                              [ticket.id]: !(current[ticket.id] ?? false),
                            }))
                          }
                          className="mb-2 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Comparativas semanales ({checksSorted.length})
                          </span>
                          <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                            {isComparativesExpanded ? "Plegar" : "Desplegar"}
                            <span
                              className={`inline-block transition-transform ${
                                isComparativesExpanded ? "rotate-180" : ""
                              }`}
                              aria-hidden="true"
                            >
                              ▾
                            </span>
                          </span>
                        </button>

                        {isComparativesExpanded && checksSorted.length > 0 ? (
                          <div className="space-y-2">
                            {checksSorted.map((check) => {
                              const winningMain = toNumberArray(check.winningNumbers);
                              const winningStars = toNumberArray(check.winningStars);
                              const reintegroHit =
                                reintegro !== null &&
                                check.winningReintegro !== null &&
                                reintegro === check.winningReintegro;

                              return (
                                <div
                                  key={`${ticket.id}-cmp-${check.id}`}
                                  className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3"
                                >
                                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                    <span>{formatDrawChip(check.drawDate)}</span>
                                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">
                                      {check.matchesMain}
                                      {check.matchesStars ? ` + ${check.matchesStars}*` : ""}
                                    </span>
                                    {(check.prizeCents ?? 0) > 0 ? (
                                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                                        {formatPrice(check.prizeCents)}
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="space-y-2">
                                    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-x-2">
                                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                        Apostado
                                      </span>
                                      <div className="flex flex-wrap items-center gap-2">
                                        {mainNumbers.map((value, index) => {
                                          const hit = winningMain.includes(value);
                                          return (
                                            <span
                                              key={`${ticket.id}-bet-main-${check.id}-${index}`}
                                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                hit
                                                  ? "bg-emerald-500 text-white"
                                                  : "bg-slate-800 text-white"
                                              }`}
                                            >
                                              {value}
                                            </span>
                                          );
                                        })}
                                        {stars.map((value, index) => {
                                          const hit = winningStars.includes(value);
                                          return (
                                            <span
                                              key={`${ticket.id}-bet-star-${check.id}-${index}`}
                                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                hit
                                                  ? "bg-emerald-200 text-emerald-900"
                                                  : "bg-[#f9c784] text-slate-900"
                                              }`}
                                            >
                                              {value}
                                            </span>
                                          );
                                        })}
                                        {ticket.draw?.type === "PRIMITIVA" ? (
                                          <span
                                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                              reintegroHit
                                                ? "bg-emerald-500 text-white"
                                                : "bg-slate-800 text-white"
                                            }`}
                                          >
                                            R {reintegro ?? "-"}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-x-2">
                                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                        Resultado
                                      </span>
                                      <div className="flex flex-wrap items-center gap-2">
                                        {winningMain.length > 0 ? (
                                          winningMain.map((value, index) => {
                                            const hit = mainNumbers.includes(value);
                                            return (
                                              <span
                                                key={`${ticket.id}-win-main-${check.id}-${index}`}
                                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                  hit
                                                    ? "bg-emerald-500 text-white"
                                                    : "bg-slate-200 text-slate-700"
                                                }`}
                                              >
                                                {value}
                                              </span>
                                            );
                                          })
                                        ) : (
                                          <span className="text-xs text-slate-400">
                                            Sin resultado cargado
                                          </span>
                                        )}
                                        {winningStars.map((value, index) => {
                                          const hit = stars.includes(value);
                                          return (
                                            <span
                                              key={`${ticket.id}-win-star-${check.id}-${index}`}
                                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                hit
                                                  ? "bg-emerald-200 text-emerald-900"
                                                  : "bg-slate-200 text-slate-700"
                                              }`}
                                            >
                                              {value}
                                            </span>
                                          );
                                        })}
                                        {ticket.draw?.type === "PRIMITIVA" ? (
                                          <span
                                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                              reintegroHit
                                                ? "bg-emerald-500 text-white"
                                                : "bg-slate-200 text-slate-700"
                                            }`}
                                          >
                                            R {check.winningReintegro ?? "-"}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : isComparativesExpanded ? (
                          <p className="text-xs text-slate-500">Sin comprobaciones todavía.</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTicket(ticket);
                          setVerifyResult(null);
                          setVerifyError(null);
                        }}
                        className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                      >
                        Ver detalle
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
          {!loading && !error && filteredTickets.length > 0 && secondaryTickets.length > 0 ? (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={() =>
                  setArchivedVisibleCount((current) =>
                    Math.min(current + ARCHIVED_PAGE_SIZE, secondaryTickets.length)
                  )
                }
                disabled={!hasMoreSecondaryTickets}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
                  hasMoreSecondaryTickets
                    ? "border border-slate-200 bg-white text-slate-600"
                    : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                }`}
              >
                {hasMoreSecondaryTickets
                  ? "Mostrar 2 más"
                  : "No hay más apuestas"}
              </button>
            </div>
          ) : null}
        </section>
      </main>

      {showMovementsModal && groupFilter !== "ALL" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowMovementsModal(false)}
          />
          <div className="relative max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Historial de bote</h3>
                <p className="text-sm text-slate-500">
                  {groups.find((group) => group.id === groupFilter)?.name ?? "Grupo"}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  Bote pendiente: {formatPrice(selectedGroupBalanceCents)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={movementTypeFilter}
                  onChange={(event) =>
                    setMovementTypeFilter(event.target.value as "ALL" | MovementType)
                  }
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  {MOVEMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowMovementsModal(false)}
                  className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto pr-1">
              {movementsError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {movementsError}
                </div>
              ) : loadingMovements ? (
                <p className="text-sm text-slate-500">Cargando historial...</p>
              ) : groupMovements.length === 0 ? (
                <p className="text-sm text-slate-500">No hay movimientos para este filtro.</p>
              ) : (
                <div className="space-y-2">
                  {groupMovements.map((movement) => {
                    const isPositive = movement.amountCents >= 0;
                    const typeLabel =
                      MOVEMENT_TYPE_OPTIONS.find((item) => item.value === movement.type)?.label ??
                      movement.type;
                    return (
                      <div
                        key={movement.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold uppercase tracking-wide text-slate-500">
                            {typeLabel}
                          </span>
                          <span className="text-slate-400">
                            {formatDateTime(movement.occurredAt)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`text-sm font-semibold ${
                              isPositive ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {isPositive ? "+" : ""}
                            {formatPrice(movement.amountCents)}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            Balance: {formatPrice(movement.runningBalanceCents)}
                          </span>
                        </div>
                        {movement.note ? (
                          <p className="mt-1 text-xs text-slate-500">{movement.note}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedTicket ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setSelectedTicket(null)}
          />

          <div className="relative max-h-[80vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  {selectedTicket.group?.name ?? "Grupo"} · {selectedTicket.status}
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
              <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Configuración de sorteos del boleto
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveTicketDrawScope}
                    disabled={editingTicket}
                    className="rounded-full border border-slate-300 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
                  >
                    {editingTicket ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Fecha base
                    </label>
                    <input
                      type="date"
                      value={editDrawDate}
                      onChange={(event) => setEditDrawDate(event.target.value)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-700"
                    />
                  </div>
                  {selectedTicket.draw?.type === "PRIMITIVA" ? (
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Cobertura
                      </label>
                      <select
                        value={editPrimitivaCoverageMode}
                        onChange={(event) =>
                          setEditPrimitivaCoverageMode(
                            event.target.value as PrimitivaCoverageMode
                          )
                        }
                        className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-700"
                      >
                        <option value="SINGLE">Solo este sorteo</option>
                        <option value="WEEKLY">Semana completa (L-J-S)</option>
                      </select>
                    </div>
                  ) : null}
                </div>
                {selectedTicket.draw?.type === "PRIMITIVA" &&
                editPrimitivaCoverageMode === "WEEKLY" &&
                editDrawDate ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Se aplicará a:{" "}
                    {getPrimitivaWeeklyDrawDates(editDrawDate)
                      .map((value) =>
                        new Date(`${value}T00:00:00.000Z`).toLocaleDateString("es-ES")
                      )
                      .join(" · ")}
                  </p>
                ) : null}
                {editTicketError ? (
                  <p className="mt-2 text-xs text-rose-700">{editTicketError}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                <span>Comprobación de premio (base local)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={checkDrawDate}
                    onChange={(event) => setCheckDrawDate(event.target.value)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600"
                  />
                  <button
                    type="button"
                    disabled={rechecking}
                    onClick={async () => {
                      setVerifying(true);
                      setVerifyError(null);
                      setVerifyResult(null);
                      try {
                        const query = new URLSearchParams({
                          ticketId: selectedTicket.id,
                        });
                        if (checkDrawDate) query.set("drawDate", checkDrawDate);
                        const response = await fetch(
                          `/api/results/verify?${query.toString()}`
                        );
                        const payload = await response.json();
                        if (!response.ok) {
                          throw new Error(payload?.error || "Error al comprobar.");
                        }
                        setVerifyResult(payload.data);
                        await loadData(true);
                      } catch (verifyLoadError) {
                        setVerifyError(
                          verifyLoadError instanceof Error
                            ? verifyLoadError.message
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
                  <button
                    type="button"
                    disabled={verifying}
                    onClick={async () => {
                      setRechecking(true);
                      setVerifyError(null);
                      try {
                        const response = await fetch("/api/results/recheck", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            ticketId: selectedTicket.id,
                          }),
                        });
                        const payload = await response.json();
                        if (!response.ok) {
                          throw new Error(payload?.error || "No se pudo recomprobar.");
                        }
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
                    }}
                    className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                  >
                    {rechecking ? "Recomprobando..." : "Recomprobar semanas"}
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
                          ? ` + ${verifyResult.matches.stars} estrellas`
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
                        setPrizeError("Introduce un importe válido.");
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
                        await loadData(true);
                      } catch (prizeSaveError) {
                        setPrizeError(
                          prizeSaveError instanceof Error
                            ? prizeSaveError.message
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
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Números
                </h4>
                <div className="mt-3 space-y-3">
                  {(selectedTicket.lines ?? []).map((line) => {
                    const main = getMainNumbers(line);
                    const stars = getStarNumbers(line);
                    return (
                      <div
                        key={line.id}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Línea {line.lineIndex}
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
                            Complementario: {line.complement ?? "-"} · Reintegro: {" "}
                            {line.reintegro ?? "-"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {(selectedTicket.checks?.length ?? 0) > 0 ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Historial de comprobaciones
                    </p>
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      {sortChecksByDate(selectedTicket.checks).map((check) => (
                        <div
                          key={check.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span>
                            {formatDate(check.drawDate)} · {check.status} · {check.matchesMain}
                            {check.matchesStars
                              ? ` + ${check.matchesStars} estrellas`
                              : ""}
                          </span>
                          <span>{formatPrice(check.prizeCents ?? null)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
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

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-slate-500">Cargando...</div>}>
      <ReviewPageContent />
    </Suspense>
  );
}
