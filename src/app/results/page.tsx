"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

export default function ResultsPage() {
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

  const loadStoredResults = useCallback(async () => {
    setLoadingResults(true);
    setResultsError(null);
    try {
      const query =
        gameFilter === "ALL" ? "/api/results/stored" : `/api/results/stored?game=${gameFilter}`;
      const response = await fetch(query);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudieron cargar resultados.");
      }
      setStoredResults(payload.data ?? []);
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
    <div className="relative bg-[#f7f2ea] text-slate-900">
      <main className="relative mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-24 pt-10 md:px-10 md:pt-14">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">
              Alta manual de resultado
            </h1>
            <p className="text-sm text-slate-600">
              Registra un sorteo de Primitiva en la base local.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/review"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Ir a review
            </Link>
            <Link
              href="/"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Ir a alta
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Fecha sorteo
                </label>
                <input
                  type="date"
                  value={drawDate}
                  onChange={(event) => setDrawDate(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Números (6)
                </label>
                <input
                  value={numbersInput}
                  onChange={(event) => setNumbersInput(event.target.value)}
                  placeholder="Ej: 4 7 8 22 40 49"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Complementario
                </label>
                <input
                  value={complementarioInput}
                  onChange={(event) => setComplementarioInput(event.target.value)}
                  placeholder="Ej: 44"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reintegro
                </label>
                <input
                  value={reintegroInput}
                  onChange={(event) => setReintegroInput(event.target.value)}
                  placeholder="Ej: 2"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                />
              </div>
            </div>

            {validation.issues.length > 0 ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                {validation.issues.map((issue, index) => (
                  <p key={index}>{issue}</p>
                ))}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!validation.isValid || saving}
                className={`rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-wide ${
                  validation.isValid && !saving
                    ? "bg-slate-900 text-white"
                    : "cursor-not-allowed bg-slate-200 text-slate-500"
                }`}
              >
                {saving ? "Guardando..." : "Guardar resultado"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Resultados guardados</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={gameFilter}
                onChange={(event) =>
                  setGameFilter(event.target.value as "ALL" | "PRIMITIVA" | "EUROMILLONES")
                }
                className="max-w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                <option value="ALL">Todos</option>
                <option value="PRIMITIVA">Primitiva</option>
                <option value="EUROMILLONES">Euromillones</option>
              </select>
              <button
                type="button"
                onClick={() => loadStoredResults()}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Recargar
              </button>
            </div>
          </div>

          {resultsError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {resultsError}
            </div>
          ) : loadingResults ? (
            <p className="text-sm text-slate-500">Cargando resultados...</p>
          ) : displayedResults.length === 0 ? (
            <p className="text-sm text-slate-500">No hay resultados guardados.</p>
          ) : (
            <div className="space-y-2">
              {missingCount > 0 ? (
                <p className="text-xs text-amber-700">
                  Faltan {missingCount} sorteos por cargar (Primitiva).
                </p>
              ) : null}
              {displayedResults.map((result) => (
                <div
                  key={result.id}
                  className={`rounded-2xl border px-4 py-3 ${
                    result.isMissing
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p
                        className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          result.isMissing
                            ? "bg-amber-200 text-amber-800"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {result.game}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {result.drawDate ?? "Sin fecha"}
                      </p>
                      {result.isMissing ? (
                        <p className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                          Falta cargar
                        </p>
                      ) : null}
                    </div>
                    {!result.isMissing ? (
                      <p className="text-[11px] text-slate-400">
                        Cargado: {new Date(result.fetchedAt).toLocaleString("es-ES")}
                      </p>
                    ) : null}
                  </div>
                  {result.isMissing ? (
                    <p className="mt-2 text-xs text-amber-800">
                      Pendiente de alta manual del resultado de este sorteo.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {result.numbers.map((value, index) => (
                        <span
                          key={`${result.id}-main-${index}`}
                          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                        >
                          {value}
                        </span>
                      ))}
                      {result.complementario !== null &&
                      result.complementario !== undefined ? (
                        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                          C {result.complementario}
                        </span>
                      ) : null}
                      {result.reintegro !== null && result.reintegro !== undefined ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                          R {result.reintegro}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
