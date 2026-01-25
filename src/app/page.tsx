"use client";

import { useEffect, useMemo, useState } from "react";

type DrawType = "PRIMITIVA" | "EUROMILLONES";

type Group = {
  id: string;
  name: string;
};

type Draw = {
  id: string;
  type: DrawType;
  drawDate: string;
  label?: string | null;
};

type Ticket = {
  id: string;
  status: "PENDIENTE" | "COMPROBADO" | "PREMIO";
  createdAt: string;
  group?: Group | null;
  draw?: Draw | null;
  lines?: Array<{ id: string }>;
};

type LineState = {
  mainInput: string;
  starInput: string;
  complement: string;
  reintegro: string;
};

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

const createEmptyLine = (): LineState => ({
  mainInput: "",
  starInput: "",
  complement: "",
  reintegro: "",
});

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
  const [drawType, setDrawType] = useState<DrawType>("PRIMITIVA");
  const [groupId, setGroupId] = useState<string>("");
  const [drawId, setDrawId] = useState<string>("");
  const [lines, setLines] = useState<LineState[]>([createEmptyLine()]);
  const [notes, setNotes] = useState<string>("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [ticketsError, setTicketsError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      setLoadingData(true);
      setLoadError(null);

      try {
        const [groupsResponse, drawsResponse] = await Promise.all([
          fetch("/api/groups"),
          fetch("/api/draws"),
        ]);

        if (!groupsResponse.ok || !drawsResponse.ok) {
          throw new Error("No se pudieron cargar los datos iniciales.");
        }

        const groupsPayload = await groupsResponse.json();
        const drawsPayload = await drawsResponse.json();

        if (!isActive) return;

        setGroups(groupsPayload.data ?? []);
        setDraws(drawsPayload.data ?? []);
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
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadTickets = async () => {
      setLoadingTickets(true);
      setTicketsError(null);

      try {
        const response = await fetch("/api/tickets");
        if (!response.ok) {
          throw new Error("No se pudieron cargar los boletos.");
        }
        const payload = await response.json();
        if (!isActive) return;
        setTickets(payload.data ?? []);
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
  }, []);

  useEffect(() => {
    const draw = draws.find((item) => item.id === drawId);
    if (draw && draw.type !== drawType) {
      setDrawType(draw.type);
    }
  }, [drawId, drawType, draws]);

  const validation = useMemo(() => {
    const issues: string[] = [];

    if (!groupId) {
      issues.push("Selecciona un grupo.");
    }
    if (!drawId) {
      issues.push("Selecciona el sorteo.");
    }

    if (receipt && !receipt.type.startsWith("image/")) {
      issues.push("El resguardo debe ser una imagen.");
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
  }, [drawId, drawType, groupId, lines, receipt]);

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
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groupId,
          drawId,
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
      setReceipt(null);
      setSubmitted(false);
      const refreshResponse = await fetch("/api/tickets");
      if (refreshResponse.ok) {
        const payload = await refreshResponse.json();
        setTickets(payload.data ?? []);
      }
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "No se pudo guardar el boleto."
      );
    } finally {
      setSaving(false);
    }
  };

  const selectedDraw = drawId ? draws.find((item) => item.id === drawId) : null;
  const selectedDrawType = selectedDraw?.type ?? drawType;

  return (
    <div className="relative min-h-screen bg-[#f7f2ea] text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-[#f9c784]/50 blur-3xl animate-glow" />
        <div className="absolute right-[-120px] top-48 h-96 w-96 rounded-full bg-[#9bb7ff]/35 blur-3xl animate-glow" />
        <div className="absolute bottom-[-160px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#f5a1b0]/30 blur-[120px]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-16 pt-10 md:flex-row md:gap-10 md:px-10 md:pt-16">
        <section className="flex flex-1 flex-col gap-6">
          <header className="animate-fade-up space-y-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
              Nuevo boleto
            </span>
            <h1 className="text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
              Alta rapida para tu grupo de loteria.
            </h1>
            <p className="max-w-xl text-base text-slate-600">
              Guarda numeros, grupo y resguardo en un solo paso. Validaciones
              listas para Primitiva y Euromillones.
            </p>
          </header>

          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <section className="animate-fade-up rounded-3xl border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <h2 className="text-lg font-semibold text-slate-900">Seleccion</h2>
              <p className="mt-1 text-sm text-slate-500">
                Define sorteo, grupo y fecha del boleto.
              </p>
              {loadError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {loadError}
                </div>
              ) : null}
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Sorteo
                  </label>
                  <select
                    value={drawId}
                    onChange={(event) => setDrawId(event.target.value)}
                    disabled={loadingData || !!loadError}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none disabled:opacity-60"
                  >
                    <option value="">
                      {loadingData ? "Cargando..." : "Selecciona sorteo"}
                    </option>
                    {draws.map((draw) => {
                      const drawLabel =
                        draw.label ??
                        `${DRAW_TYPES.find((item) => item.id === draw.type)?.label ?? "Sorteo"} · ${new Date(
                          draw.drawDate
                        ).toLocaleDateString("es-ES")}`;
                      return (
                        <option key={draw.id} value={draw.id}>
                          {drawLabel}
                        </option>
                      );
                    })}
                  </select>
                  <div className="text-xs text-slate-500">
                    {selectedDraw
                      ? DRAW_TYPES.find((item) => item.id === selectedDraw.type)
                          ?.description
                      : "Selecciona un sorteo para ver sus reglas."}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Grupo
                  </label>
                  <select
                    value={groupId}
                    onChange={(event) => setGroupId(event.target.value)}
                    disabled={loadingData || !!loadError}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none disabled:opacity-60"
                  >
                    <option value="">
                      {loadingData ? "Cargando..." : "Selecciona grupo"}
                    </option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tipo de sorteo
                  </label>
                  <input
                    type="text"
                    value={
                      DRAW_TYPES.find((item) => item.id === selectedDrawType)
                        ?.label ?? "Sin definir"
                    }
                    readOnly
                    className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700 focus:outline-none"
                  />
                </div>
              </div>
            </section>

            <section className="animate-fade-up rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Numeros</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Usa comas o espacios para separar numeros.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLines((current) => [...current, createEmptyLine()])}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                >
                  + Linea
                </button>
              </div>

              <div className="mt-5 flex flex-col gap-6">
                {lines.map((line, index) => {
                  const lineValidation = validation.lineResults[index];
                  return (
                    <div
                      key={index}
                      className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Linea {index + 1}
                        </span>
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setLines((current) =>
                                current.filter((_, lineIndex) => lineIndex !== index)
                              )
                            }
                            className="text-xs font-semibold uppercase tracking-wide text-slate-400 transition hover:text-slate-600"
                          >
                            Quitar
                          </button>
                        )}
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Numeros principales
                          </label>
                          <input
                            value={line.mainInput}
                            onChange={(event) =>
                              handleLineChange(index, { mainInput: event.target.value })
                            }
                            placeholder={
                              selectedDrawType === "PRIMITIVA"
                                ? "Ej: 4 9 13 28 33 41"
                                : "Ej: 7 18 24 33 49"
                            }
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                          />
                        </div>

                        {selectedDrawType === "EUROMILLONES" ? (
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Estrellas
                            </label>
                            <input
                              value={line.starInput}
                              onChange={(event) =>
                                handleLineChange(index, { starInput: event.target.value })
                              }
                              placeholder="Ej: 2 11"
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="flex flex-col gap-2">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Complementario
                              </label>
                              <input
                                value={line.complement}
                                onChange={(event) =>
                                  handleLineChange(index, { complement: event.target.value })
                                }
                                placeholder="Ej: 12"
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Reintegro
                              </label>
                              <input
                                value={line.reintegro}
                                onChange={(event) =>
                                  handleLineChange(index, { reintegro: event.target.value })
                                }
                                placeholder="Ej: 6"
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {lineValidation?.issues.length ? (
                        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                          {lineValidation.issues.map((issue, issueIndex) => (
                            <p key={issueIndex}>{issue}</p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="animate-fade-up rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <h2 className="text-lg font-semibold text-slate-900">Resguardo</h2>
              <p className="mt-1 text-sm text-slate-500">
                Opcional, pero recomendable para comprobaciones.
              </p>
              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wide file:text-white"
                />
                {receipt ? (
                  <span className="text-xs text-slate-500">
                    {receipt.name} ({Math.round(receipt.size / 1024)} KB)
                  </span>
                ) : null}
              </div>
            </section>

            <section className="animate-fade-up rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Notas
              </label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ej: Boleto compartido con Marta y Luis."
                rows={3}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              />
            </section>

            <section className="animate-fade-up rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-slate-500">
                  {selectedDraw ? selectedDraw.label ?? "Sorteo" : "Sorteo"} ·{" "}
                  {lines.length} linea(s)
                </div>
                <button
                  type="submit"
                  disabled={!validation.isValid || saving}
                  className={`rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-wide transition ${
                    validation.isValid && !saving
                      ? "bg-slate-900 text-white hover:bg-slate-700"
                      : "cursor-not-allowed bg-slate-200 text-slate-500"
                  }`}
                >
                  {saving ? "Guardando..." : "Guardar boleto"}
                </button>
              </div>

              {saveSuccess ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {saveSuccess}
                </div>
              ) : null}

              {saveError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {saveError}
                </div>
              ) : null}

              {submitted && !validation.isValid ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  Revisa las validaciones para continuar.
                </div>
              ) : null}
            </section>
          </form>
        </section>

        <aside className="animate-fade-up flex w-full max-w-md flex-col gap-6 self-start md:sticky md:top-12">
          <div className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
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
                  Fecha
                </span>
                <p className="mt-1 font-semibold text-slate-900">
                  {selectedDraw?.drawDate
                    ? new Date(selectedDraw.drawDate).toLocaleDateString("es-ES")
                    : "Sin definir"}
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
                        <span
                          key={`${value}-${valueIndex}`}
                          className="rounded-full bg-white/20 px-3 py-1 text-sm"
                        >
                          {value}
                        </span>
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
                          <span
                            key={`star-${value}-${valueIndex}`}
                            className="rounded-full bg-[#f9c784] px-3 py-1 text-sm text-slate-900"
                          >
                            {value}
                          </span>
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

          <div className="rounded-3xl border border-white/70 bg-white/90 p-6 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
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

          <div className="rounded-3xl border border-white/70 bg-white/90 p-6 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Boletos recientes
            </h4>
            {ticketsError ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {ticketsError}
              </div>
            ) : null}
            {loadingTickets ? (
              <p className="mt-3 text-sm text-slate-500">Cargando boletos...</p>
            ) : tickets.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Aun no hay boletos guardados.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {tickets.slice(0, 5).map((ticket) => {
                  const drawLabel =
                    ticket.draw?.label ??
                    (ticket.draw
                      ? `${DRAW_TYPES.find((item) => item.id === ticket.draw?.type)?.label ?? "Sorteo"} · ${new Date(
                          ticket.draw.drawDate
                        ).toLocaleDateString("es-ES")}`
                      : "Sorteo");
                  const groupLabel = ticket.group?.name ?? "Grupo";
                  const lineCount = ticket.lines?.length ?? 0;
                  return (
                    <div
                      key={ticket.id}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        {groupLabel} · {ticket.status}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {drawLabel}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {lineCount} linea(s)
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
