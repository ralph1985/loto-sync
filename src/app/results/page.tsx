"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { InlineAlert } from "@/components/ui/inline-alert";
import { ModalShell } from "@/components/ui/modal-shell";
import { NumberBadge } from "@/components/ui/number-badge";
import { PageShell } from "@/components/ui/page-shell";
import { SurfaceCard } from "@/components/ui/surface-card";
import {
  buildDisplayedResults,
  clearStoredResultsCache,
  DRAW_WEEKDAYS,
  loadStoredResults as fetchStoredResults,
  type StoredResult,
} from "@/features/results/data";

const parseNumbers = (value: string) =>
  value
    .split(/[\s,.-]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => !Number.isNaN(item));

const isValidPrimitivaDrawDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return DRAW_WEEKDAYS.has(date.getUTCDay());
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

  useEffect(() => {
    const requestedGame = new URLSearchParams(window.location.search).get("game");
    if (requestedGame === "PRIMITIVA" || requestedGame === "EUROMILLONES") {
      setGameFilter(requestedGame);
    }
  }, []);

  const loadStoredResults = useCallback(async (forceRefresh = false) => {
    setLoadingResults(true);
    setResultsError(null);
    try {
      setStoredResults(await fetchStoredResults(gameFilter, forceRefresh));
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

  const displayedResults = useMemo(
    () => buildDisplayedResults(storedResults, gameFilter),
    [gameFilter, storedResults]
  );

  const missingCount = useMemo(
    () => displayedResults.filter((item) => item.isMissing).length,
    [displayedResults]
  );

  return (
    <PageShell mainClassName="flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Histórico</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Resultados guardados</h1>
          <p className="mt-1 text-sm text-base-content/70">Consulta sorteos cargados y completa manualmente los que falten.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="btn btn-ghost btn-sm">Volver al panel</Link>
          <button type="button" onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">Alta manual</button>
        </div>
      </header>

      <SurfaceCard>
        {success ? <InlineAlert tone="success" className="mb-4">{success}</InlineAlert> : null}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold tracking-tight">Sorteos disponibles</h2>
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
                className={`rounded-xl border px-4 py-3 ${
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
