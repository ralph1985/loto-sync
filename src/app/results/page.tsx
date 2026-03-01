"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { ModalShell } from "@/components/ui/modal-shell";
import { NumberBadge } from "@/components/ui/number-badge";
import { PageShell } from "@/components/ui/page-shell";
import { SurfaceCard } from "@/components/ui/surface-card";

const parseNumbers = (value: string) =>
  value
    .split(/[\s,.-]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => !Number.isNaN(item));

const DRAW_WEEKDAYS = new Set([1, 4, 6]); // lunes, jueves, sabado

const toIsoDate = (value: Date) => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isValidPrimitivaDrawDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return DRAW_WEEKDAYS.has(date.getUTCDay());
};

type StoredResult = {
  id: string;
  game: "PRIMITIVA" | "EUROMILLONES";
  drawDate: string | null;
  numbers: number[];
  stars?: number[];
  complementario?: number | null;
  reintegro?: number | null;
  fetchedAt: string;
};

const STORED_RESULTS_CACHE_PREFIX = "results:stored:";
const STORED_RESULTS_CACHE_TTL_MS = 60 * 60 * 1000;

const getStoredResultsCacheKey = (gameFilter: "ALL" | "PRIMITIVA" | "EUROMILLONES") =>
  `${STORED_RESULTS_CACHE_PREFIX}${gameFilter}`;

const clearStoredResultsCache = () => {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(STORED_RESULTS_CACHE_PREFIX)) {
      keys.push(key);
    }
  }
  keys.forEach((key) => window.localStorage.removeItem(key));
};

export default function ResultsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [gameFilter, setGameFilter] = useState<"ALL" | "PRIMITIVA" | "EUROMILLONES">(
    "ALL"
  );
  const [drawDate, setDrawDate] = useState("");
  const [numbersInput, setNumbersInput] = useState("");
  const [complementarioInput, setComplementarioInput] = useState("");
  const [reintegroInput, setReintegroInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingResults, setLoadingResults] = useState(true);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [storedResults, setStoredResults] = useState<StoredResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStoredResults = useCallback(async (forceRefresh = false) => {
    setLoadingResults(true);
    setResultsError(null);
    try {
      const cacheKey = getStoredResultsCacheKey(gameFilter);
      if (!forceRefresh && typeof window !== "undefined") {
        const cachedRaw = window.localStorage.getItem(cacheKey);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw) as {
              cachedAt?: number;
              data?: StoredResult[];
            };
            const cachedAt = typeof cached.cachedAt === "number" ? cached.cachedAt : 0;
            if (
              Array.isArray(cached.data) &&
              cachedAt > 0 &&
              Date.now() - cachedAt < STORED_RESULTS_CACHE_TTL_MS
            ) {
              setStoredResults(cached.data);
              return;
            }
          } catch {
            window.localStorage.removeItem(cacheKey);
          }
        }
      }

      const query =
        gameFilter === "ALL" ? "/api/results/stored" : `/api/results/stored?game=${gameFilter}`;
      const response = await fetch(query);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudieron cargar resultados.");
      }
      const data = payload.data ?? [];
      setStoredResults(data);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({
            cachedAt: Date.now(),
            data,
          })
        );
      }
    } catch (loadError) {
      setResultsError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar resultados."
      );
    } finally {
      setLoadingResults(false);
    }
  }, [gameFilter]);

  useEffect(() => {
    loadStoredResults();
  }, [loadStoredResults]);

  const validation = useMemo(() => {
    const issues: string[] = [];
    const numbers = parseNumbers(numbersInput);

    if (!drawDate) {
      issues.push("La fecha del sorteo es obligatoria.");
    } else if (!isValidPrimitivaDrawDate(drawDate)) {
      issues.push("La fecha de Primitiva debe ser lunes, jueves o sábado.");
    }
    if (numbers.length !== 6) {
      issues.push("Debes indicar 6 números para Primitiva.");
    }
    const unique = new Set(numbers);
    if (unique.size !== numbers.length) {
      issues.push("No puede haber números repetidos.");
    }
    if (numbers.some((n) => n < 1 || n > 49)) {
      issues.push("Los números deben estar entre 1 y 49.");
    }

    const complementario = complementarioInput.trim()
      ? Number.parseInt(complementarioInput, 10)
      : null;
    const reintegro = reintegroInput.trim()
      ? Number.parseInt(reintegroInput, 10)
      : null;

    if (complementario !== null) {
      if (Number.isNaN(complementario) || complementario < 1 || complementario > 49) {
        issues.push("Complementario debe estar entre 1 y 49.");
      } else if (numbers.includes(complementario)) {
        issues.push("Complementario no puede repetirse con los números principales.");
      }
    }

    if (reintegro !== null) {
      if (Number.isNaN(reintegro) || reintegro < 0 || reintegro > 9) {
        issues.push("Reintegro debe estar entre 0 y 9.");
      }
    }

    return {
      issues,
      isValid: issues.length === 0,
      payload: {
        game: "LA_PRIMITIVA",
        results: [
          {
            date: drawDate,
            numbers,
            complementario,
            reintegro,
          },
        ],
      },
    };
  }, [complementarioInput, drawDate, numbersInput, reintegroInput]);

  const displayedResults = useMemo(() => {
    const rows = storedResults.map((item) => ({
      ...item,
      fetchedAt: item.fetchedAt,
      isMissing: false,
    }));

    const shouldInjectPrimitivaGaps = gameFilter === "ALL" || gameFilter === "PRIMITIVA";
    if (shouldInjectPrimitivaGaps) {
      const primitivaDates = storedResults
        .filter((item) => item.game === "PRIMITIVA" && item.drawDate)
        .map((item) => item.drawDate as string)
        .sort();

      if (primitivaDates.length > 0) {
        const firstDate = new Date(`${primitivaDates[0]}T00:00:00Z`);
        const today = new Date();
        const endDate = new Date(
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
        );
        const available = new Set(primitivaDates);

        for (
          let cursor = new Date(firstDate);
          cursor <= endDate;
          cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
        ) {
          if (!DRAW_WEEKDAYS.has(cursor.getUTCDay())) {
            continue;
          }
          const isoDate = toIsoDate(cursor);
          if (!available.has(isoDate)) {
            rows.push({
              id: `missing-${isoDate}`,
              game: "PRIMITIVA",
              drawDate: isoDate,
              numbers: [],
              stars: [],
              complementario: null,
              reintegro: null,
              fetchedAt: "",
              isMissing: true,
            });
          }
        }
      }
    }

    return rows.sort((left, right) => {
      const leftTime = left.drawDate ? Date.parse(`${left.drawDate}T00:00:00Z`) : 0;
      const rightTime = right.drawDate ? Date.parse(`${right.drawDate}T00:00:00Z`) : 0;
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      if (left.isMissing !== right.isMissing) {
        return left.isMissing ? 1 : -1;
      }
      if (!left.fetchedAt || !right.fetchedAt) {
        return 0;
      }
      return Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt);
    });
  }, [gameFilter, storedResults]);

  const missingCount = useMemo(
    () => displayedResults.filter((item) => item.isMissing).length,
    [displayedResults]
  );

  return (
    <PageShell mainClassName="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Resultados guardados</h1>
          <p className="text-sm text-base-content/70">Historico de sorteos cargados.</p>
        </div>
        <button type="button" onClick={() => setShowCreateModal(true)} className="btn btn-outline btn-sm">
          Alta manual
        </button>
      </header>

      <SurfaceCard>
        {success ? <InlineAlert tone="success" className="mb-4">{success}</InlineAlert> : null}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Resultados guardados</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={gameFilter}
              onChange={(event) =>
                setGameFilter(event.target.value as "ALL" | "PRIMITIVA" | "EUROMILLONES")
              }
              className="select select-bordered select-sm"
            >
              <option value="ALL">Todos</option>
              <option value="PRIMITIVA">Primitiva</option>
              <option value="EUROMILLONES">Euromillones</option>
            </select>
            <button type="button" onClick={() => loadStoredResults(true)} className="btn btn-sm btn-outline">
              Recargar
            </button>
          </div>
        </div>

        {resultsError ? (
          <InlineAlert tone="error">{resultsError}</InlineAlert>
        ) : loadingResults ? (
          <p className="text-sm text-base-content/70">Cargando resultados...</p>
        ) : displayedResults.length === 0 ? (
          <p className="text-sm text-base-content/70">No hay resultados guardados.</p>
        ) : (
          <div className="space-y-2">
            {missingCount > 0 ? (
              <InlineAlert tone="warning">Faltan {missingCount} sorteos por cargar (Primitiva).</InlineAlert>
            ) : null}
            {displayedResults.map((result) => (
              <div
                key={result.id}
                className={`rounded-2xl border px-4 py-3 ${
                  result.isMissing ? "border-warning/40 bg-warning/10" : "border-base-300 bg-base-200/40"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`badge badge-sm font-semibold ${result.isMissing ? "badge-warning" : "badge-ghost"}`}>
                      {result.game}
                    </span>
                    <p className="text-xs font-semibold uppercase tracking-wide text-base-content/70">
                      {result.drawDate ?? "Sin fecha"}
                    </p>
                    {result.isMissing ? <span className="badge badge-error badge-sm">Falta cargar</span> : null}
                  </div>
                  {!result.isMissing ? (
                    <p className="text-[11px] text-base-content/60">
                      Cargado: {new Date(result.fetchedAt).toLocaleString("es-ES")}
                    </p>
                  ) : null}
                </div>
                {result.isMissing ? (
                  <p className="mt-2 text-xs text-base-content/80">
                    Pendiente de alta manual del resultado de este sorteo.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.numbers.map((value, index) => (
                      <NumberBadge key={`${result.id}-main-${index}`} value={value} tone="primary" />
                    ))}
                    {result.complementario !== null && result.complementario !== undefined ? (
                      <NumberBadge value={`C ${result.complementario}`} tone="neutral" />
                    ) : null}
                    {result.reintegro !== null && result.reintegro !== undefined ? (
                      <NumberBadge value={`R ${result.reintegro}`} tone="success" />
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      <ModalShell open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Alta manual</h2>
            <p className="text-sm text-base-content/70">Primitiva (lunes, jueves o sábado).</p>
          </div>
          <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-sm btn-ghost">
            Cerrar
          </button>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setSuccess(null);
            if (!validation.isValid || saving) return;

            setSaving(true);
            try {
              const response = await fetch("/api/results/import", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(validation.payload),
              });
              const payload = await response.json();
              if (!response.ok) {
                const issues = Array.isArray(payload?.issues)
                  ? payload.issues.join(" ")
                  : payload?.error;
                throw new Error(issues || "No se pudo guardar el resultado.");
              }

              setSuccess("Resultado guardado correctamente.");
              setDrawDate("");
              setNumbersInput("");
              setComplementarioInput("");
              setReintegroInput("");
              setShowCreateModal(false);
              clearStoredResultsCache();
              await loadStoredResults();
            } catch (submitError) {
              setError(
                submitError instanceof Error
                  ? submitError.message
                  : "No se pudo guardar el resultado."
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-base-content/70">
                Fecha sorteo
              </label>
              <input
                type="date"
                value={drawDate}
                onChange={(event) => setDrawDate(event.target.value)}
                className="input input-bordered w-full"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-base-content/70">
                Números (6)
              </label>
              <input
                value={numbersInput}
                onChange={(event) => setNumbersInput(event.target.value)}
                placeholder="Ej: 4 7 8 22 40 49"
                className="input input-bordered w-full"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-base-content/70">
                Complementario
              </label>
              <input
                value={complementarioInput}
                onChange={(event) => setComplementarioInput(event.target.value)}
                placeholder="Ej: 44"
                className="input input-bordered w-full"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-base-content/70">
                Reintegro
              </label>
              <input
                value={reintegroInput}
                onChange={(event) => setReintegroInput(event.target.value)}
                placeholder="Ej: 2"
                className="input input-bordered w-full"
              />
            </div>
          </div>

          {validation.issues.length > 0 ? (
            <InlineAlert tone="error">
              {validation.issues.map((issue, index) => (
                <span key={index} className="block">
                  {issue}
                </span>
              ))}
            </InlineAlert>
          ) : null}
          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

          <div className="flex justify-end">
            <button type="submit" disabled={!validation.isValid || saving} className="btn btn-primary">
              {saving ? "Guardando..." : "Guardar resultado"}
            </button>
          </div>
        </form>
      </ModalShell>
    </PageShell>
  );
}
