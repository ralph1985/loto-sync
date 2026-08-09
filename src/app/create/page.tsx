"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { NumberBadge } from "@/components/ui/number-badge";
import { TicketCreateForm, type LineState } from "@/components/create/ticket-create-form";
import { TicketDetailModal } from "@/components/tickets/ticket-detail-modal";
import { buildDrawLabel, formatDate, formatPrice } from "@/features/tickets/formatters";
import type {
  Draw,
  DrawType,
  Group,
  PrimitivaCoverageMode,
  Ticket,
} from "@/features/tickets/types";
import { loadSessionClient } from "@/lib/session-client";

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

const API_CACHE_TTL_MS = 60 * 60 * 1000;
const API_TICKETS_CACHE_KEY = "review:api:tickets";
const API_GROUPS_CACHE_KEY = "review:api:groups";

const readApiCache = <T,>(key: string): T | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { cachedAt?: number; data?: T };
    if (
      typeof parsed.cachedAt === "number" &&
      Date.now() - parsed.cachedAt < API_CACHE_TTL_MS &&
      parsed.data !== undefined
    ) {
      return parsed.data;
    }
  } catch {
    window.localStorage.removeItem(key);
  }
  return null;
};

const writeApiCache = <T,>(key: string, data: T) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    key,
    JSON.stringify({
      cachedAt: Date.now(),
      data,
    })
  );
};

const createEmptyLine = (): LineState => ({
  mainInput: "",
  starInput: "",
  complement: "",
  reintegro: "",
});

const getPrimitivaWeeklyDrawDates = (drawDate: string) => {
  const source = new Date(`${drawDate}T00:00:00.000Z`);
  if (Number.isNaN(source.getTime())) return [];
  const weekday = source.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(source);
  monday.setUTCDate(source.getUTCDate() + mondayOffset);

  const candidates = [0, 3, 5].map((offset) => {
    const value = new Date(monday);
    value.setUTCDate(monday.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  });
  return candidates;
};

const toIntArray = (input: string) =>
  input
    .split(/[\s,.-]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => !Number.isNaN(value));

const validateNumberSet = (
  input: string,
  expectedCount: number,
  min: number,
  max: number
) => {
  const values = toIntArray(input);
  const errors: string[] = [];

  if (values.length !== expectedCount) {
    errors.push(`Necesitas ${expectedCount} numeros.`);
  }

  const uniques = new Set(values);
  if (uniques.size !== values.length) {
    errors.push("Hay numeros repetidos.");
  }

  if (values.some((value) => value < min || value > max)) {
    errors.push(`Los numeros deben estar entre ${min} y ${max}.`);
  }

  return { values, errors };
};

export default function Home() {
  const router = useRouter();
  const [drawType, setDrawType] = useState<DrawType>("PRIMITIVA");
  const [primitivaCoverageMode, setPrimitivaCoverageMode] =
    useState<PrimitivaCoverageMode>("SINGLE");
  const [drawDate, setDrawDate] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");
  const [priceInput, setPriceInput] = useState<string>("");
  const [playsJoker, setPlaysJoker] = useState(false);
  const [jokerNumber, setJokerNumber] = useState<string>("");
  const [lines, setLines] = useState<LineState[]>([createEmptyLine()]);
  const [notes, setNotes] = useState<string>("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [copiedTicketId, setCopiedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [canAccessCreate, setCanAccessCreate] = useState<boolean | null>(null);

  const refreshInitialData = useCallback(async () => {
    setLoadingData(true);
    setLoadingTickets(true);
    setLoadError(null);
    setTicketsError(null);
    try {
      const [groupsResponse, ticketsResponse] = await Promise.all([
        fetch("/api/groups"),
        fetch("/api/tickets"),
      ]);
      if (!groupsResponse.ok || !ticketsResponse.ok) {
        throw new Error("No se pudieron recargar los datos.");
      }
      const groupsPayload = await groupsResponse.json();
      const ticketsPayload = await ticketsResponse.json();
      const nextGroups = groupsPayload.data ?? [];
      const nextTickets = ticketsPayload.data ?? [];
      setGroups(nextGroups);
      setTickets(nextTickets);
      writeApiCache(API_GROUPS_CACHE_KEY, nextGroups);
      writeApiCache(API_TICKETS_CACHE_KEY, nextTickets);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudieron recargar los datos.";
      setLoadError(message);
      setTicketsError(message);
    } finally {
      setLoadingData(false);
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    (async () => {
      try {
        const session = await loadSessionClient();
        if (!isActive) return;
        if (!session) {
          router.replace("/login");
          setCanAccessCreate(false);
          return;
        }
        const memberships = Array.isArray(session.memberships)
          ? session.memberships
          : [];
        const hasCreatePermission = memberships.some(
          (membership: { role?: string }) => membership.role === "OWNER"
        );
        if (!hasCreatePermission) {
          router.replace("/review");
          setCanAccessCreate(false);
          return;
        }
        setCanAccessCreate(true);
      } catch {
        if (!isActive) return;
        router.replace("/review");
        setCanAccessCreate(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [router]);

  useEffect(() => {
    if (canAccessCreate !== true) return;
    let isActive = true;

    const load = async () => {
      setLoadingData(true);
      setLoadError(null);

      try {
        const cachedGroups = readApiCache<Group[]>(API_GROUPS_CACHE_KEY);
        if (cachedGroups) {
          if (!isActive) return;
          setGroups(cachedGroups);
          return;
        }

        const groupsResponse = await fetch("/api/groups");
        if (!groupsResponse.ok) {
          throw new Error("No se pudieron cargar los datos iniciales.");
        }

        const groupsPayload = await groupsResponse.json();
        const nextGroups = groupsPayload.data ?? [];

        if (!isActive) return;

        setGroups(nextGroups);
        writeApiCache(API_GROUPS_CACHE_KEY, nextGroups);
      } catch (error) {
        if (!isActive) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los datos iniciales."
        );
      } finally {
        if (isActive) {
          setLoadingData(false);
        }
      }
    };

    load();

    return () => {
      isActive = false;
    };
  }, [canAccessCreate]);

  useEffect(() => {
    if (loadingData) return;
    if (groups.length === 1 && !groupId) {
      setGroupId(groups[0].id);
    }
  }, [groupId, groups, loadingData]);

  useEffect(() => {
    if (drawType !== "PRIMITIVA") {
      setPlaysJoker(false);
      setJokerNumber("");
      setPrimitivaCoverageMode("SINGLE");
    }
  }, [drawType]);

  useEffect(() => {
    if (canAccessCreate !== true) return;
    let isActive = true;

    const loadTickets = async () => {
      setLoadingTickets(true);
      setTicketsError(null);

      try {
        const cachedTickets = readApiCache<Ticket[]>(API_TICKETS_CACHE_KEY);
        if (cachedTickets) {
          if (!isActive) return;
          setTickets(cachedTickets);
          return;
        }

        const response = await fetch("/api/tickets");
        if (!response.ok) {
          throw new Error("No se pudieron cargar los boletos.");
        }
        const payload = await response.json();
        const nextTickets = payload.data ?? [];
        if (!isActive) return;
        setTickets(nextTickets);
        writeApiCache(API_TICKETS_CACHE_KEY, nextTickets);
      } catch (error) {
        if (!isActive) return;
        setTicketsError(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los boletos."
        );
      } finally {
        if (isActive) {
          setLoadingTickets(false);
        }
      }
    };

    loadTickets();

    return () => {
      isActive = false;
    };
  }, [canAccessCreate]);

  const validation = useMemo(() => {
    const issues: string[] = [];

    if (!groupId) {
      issues.push("Selecciona un grupo.");
    }
    if (!drawDate) {
      issues.push("Selecciona la fecha del sorteo.");
    }

    if (receipt && !receipt.type.startsWith("image/")) {
      issues.push("El resguardo debe ser una imagen.");
    }

    if (priceInput.trim()) {
      const normalized = priceInput.replace(",", ".");
      const parsed = Number.parseFloat(normalized);
      if (Number.isNaN(parsed)) {
        issues.push("El precio debe ser un numero.");
      } else if (parsed < 0) {
        issues.push("El precio no puede ser negativo.");
      } else if (Math.abs(parsed * 100 - Math.round(parsed * 100)) > 1e-6) {
        issues.push("El precio debe tener como maximo 2 decimales.");
      }
    }

    if (drawType === "PRIMITIVA" && playsJoker) {
      if (!/^\d{7}$/.test(jokerNumber.trim())) {
        issues.push("El numero de Joker debe tener 7 digitos.");
      }
    }

    const lineResults = lines.map((line) => {
      const lineIssues: string[] = [];
      const mainExpected = drawType === "PRIMITIVA" ? 6 : 5;
      const mainRange = drawType === "PRIMITIVA" ? [1, 49] : [1, 50];
      const main = validateNumberSet(
        line.mainInput,
        mainExpected,
        mainRange[0],
        mainRange[1]
      );

      lineIssues.push(...main.errors.map((error) => `Numeros: ${error}`));

      let stars: number[] = [];

      if (drawType === "EUROMILLONES") {
        const star = validateNumberSet(line.starInput, 2, 1, 12);
        stars = star.values;
        lineIssues.push(...star.errors.map((error) => `Estrellas: ${error}`));
      }

      if (drawType === "PRIMITIVA" && line.complement.trim()) {
        const complementValue = Number.parseInt(line.complement, 10);
        if (Number.isNaN(complementValue)) {
          lineIssues.push("Complementario debe ser un numero.");
        } else if (complementValue < 1 || complementValue > 49) {
          lineIssues.push("Complementario debe estar entre 1 y 49.");
        } else if (main.values.includes(complementValue)) {
          lineIssues.push("Complementario no puede repetirse.");
        }
      }

      if (drawType === "PRIMITIVA" && line.reintegro.trim()) {
        const reintegroValue = Number.parseInt(line.reintegro, 10);
        if (Number.isNaN(reintegroValue)) {
          lineIssues.push("Reintegro debe ser un numero.");
        } else if (reintegroValue < 0 || reintegroValue > 9) {
          lineIssues.push("Reintegro debe estar entre 0 y 9.");
        }
      }

      return {
        issues: lineIssues,
        main: main.values,
        stars,
      };
    });

    if (lines.length === 0) {
      issues.push("Debes añadir al menos una linea.");
    }

    return {
      issues,
      lineResults,
      isValid:
        issues.length === 0 &&
        lineResults.every((line) => line.issues.length === 0),
    };
  }, [drawDate, drawType, groupId, jokerNumber, lines, playsJoker, priceInput, receipt]);

  const handleLineChange = (index: number, patch: Partial<LineState>) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      )
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    setSaveSuccess(null);

    if (!validation.isValid || saving) {
      return;
    }

    setSaving(true);

    try {
      const normalizedPrice = priceInput.trim().replace(",", ".");
      const parsedPrice = normalizedPrice
        ? Number.parseFloat(normalizedPrice)
        : null;
      const priceCents =
        parsedPrice === null || Number.isNaN(parsedPrice)
          ? undefined
          : Math.round(parsedPrice * 100);

      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groupId,
          drawType,
          drawDate,
          drawDates:
            drawType === "PRIMITIVA" && primitivaCoverageMode === "WEEKLY"
              ? getPrimitivaWeeklyDrawDates(drawDate)
              : undefined,
          priceCents,
          playsJoker: drawType === "PRIMITIVA" ? playsJoker : undefined,
          jokerNumber:
            drawType === "PRIMITIVA" && playsJoker
              ? jokerNumber.trim()
              : undefined,
          notes: notes.trim() || undefined,
          lines: lines.map((line) => ({
            mainNumbers: toIntArray(line.mainInput),
            starNumbers:
              drawType === "EUROMILLONES"
                ? toIntArray(line.starInput)
                : undefined,
            complement: line.complement
              ? Number.parseInt(line.complement, 10)
              : undefined,
            reintegro: line.reintegro
              ? Number.parseInt(line.reintegro, 10)
              : undefined,
          })),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        const issues = Array.isArray(payload?.issues)
          ? payload.issues.join(" ")
          : payload?.error;
        throw new Error(issues || "No se pudo guardar el boleto.");
      }

      let successMessage = "Boleto guardado correctamente.";

      if (receipt) {
        const formData = new FormData();
        formData.append("ticketId", payload.data.id);
        formData.append("file", receipt);

        const uploadResponse = await fetch("/api/receipts", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const uploadPayload = await uploadResponse.json();
          const uploadMessage =
            uploadPayload?.error || "No se pudo subir el resguardo.";
          throw new Error(`${successMessage} ${uploadMessage}`);
        }

        successMessage = "Boleto y resguardo guardados correctamente.";
      }

      setSaveSuccess(successMessage);
      setLines([createEmptyLine()]);
      setNotes("");
      setPriceInput("");
      setPlaysJoker(false);
      setJokerNumber("");
      setPrimitivaCoverageMode("SINGLE");
      setReceipt(null);
      setSubmitted(false);
      const refreshResponse = await fetch("/api/tickets");
      if (refreshResponse.ok) {
        const payload = await refreshResponse.json();
        const nextTickets = payload.data ?? [];
        setTickets(nextTickets);
        writeApiCache(API_TICKETS_CACHE_KEY, nextTickets);
      }
      const refreshGroupsResponse = await fetch("/api/groups");
      if (refreshGroupsResponse.ok) {
        const groupsPayload = await refreshGroupsResponse.json();
        const nextGroups = groupsPayload.data ?? [];
        setGroups(nextGroups);
        writeApiCache(API_GROUPS_CACHE_KEY, nextGroups);
      }
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "No se pudo guardar el boleto."
      );
    } finally {
      setSaving(false);
    }
  };

  const selectedDraw: Draw | null = drawDate
    ? {
        id: `${drawType}-${drawDate}`,
        type: drawType,
        drawDate,
        label: `${DRAW_TYPES.find((item) => item.id === drawType)?.label ?? "Sorteo"} · ${formatDate(drawDate)}`,
      }
    : null;
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
            weeklyDrawDates={getPrimitivaWeeklyDrawDates}
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

          <div className="rounded-3xl border border-white/70 bg-white/90 p-4 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Boletos recientes
            </h4>
            {ticketsError ? (
              <InlineAlert tone="error" className="mt-3">{ticketsError}</InlineAlert>
            ) : null}
            {loadingTickets ? (
              <div className="mt-4 space-y-3">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-16 rounded-2xl border border-slate-200 bg-white/70 animate-pulse"
                  />
                ))}
              </div>
            ) : latestTickets.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Aun no hay boletos guardados.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {latestTickets.map((ticket) => {
                  const drawLabel = buildDrawLabel(ticket.draw);
                  const groupLabel = ticket.group?.name ?? "Grupo";
                  const lineCount = ticket.lines?.length ?? 0;
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
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-slate-400">
                        <span>
                          {groupLabel} · {ticket.status}
                        </span>
                        <span>{formatDate(ticket.createdAt)}</span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {drawLabel}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {mainNumbers.length > 0 ? (
                          mainNumbers.map((value, index) => (
                            <NumberBadge key={`${ticket.id}-main-${index}`} value={value} tone="neutral" />
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">
                            Sin numeros
                          </span>
                        )}
                        {stars.length > 0
                          ? stars.map((value, index) => (
                              <NumberBadge key={`${ticket.id}-star-${index}`} value={value} tone="accent" />
                            ))
                          : null}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {lineCount} linea(s) · {formatPrice(ticket.priceCents)}
                          {ticket.draw?.type === "PRIMITIVA"
                            ? ticket.playsJoker
                              ? ` · Joker ${ticket.jokerNumber ?? "-"}`
                              : " · Sin Joker"
                            : ""}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopy(ticket)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                          >
                            {copiedTicketId === ticket.id
                              ? "Copiado"
                              : "Copiar"}
                          </button>
                          <Link
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              setSelectedTicket(ticket);
                            }}
                            className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                          >
                            Ver detalle
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </main>
      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </div>
  );
}
