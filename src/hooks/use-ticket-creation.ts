"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";

import type { Draw, DrawType, PrimitivaCoverageMode } from "@/features/tickets/types";
import type { LineState } from "@/components/create/ticket-lines-editor";

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
  return [0, 3, 5].map((offset) => {
    const value = new Date(monday);
    value.setUTCDate(monday.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  });
};

const toIntArray = (input: string) =>
  input.split(/[\s,.-]+/).map((value) => value.trim()).filter(Boolean)
    .map((value) => Number.parseInt(value, 10)).filter((value) => !Number.isNaN(value));

const validateNumberSet = (input: string, expectedCount: number, min: number, max: number) => {
  const values = toIntArray(input);
  const errors: string[] = [];
  if (values.length !== expectedCount) errors.push(`Necesitas ${expectedCount} numeros.`);
  if (new Set(values).size !== values.length) errors.push("Hay numeros repetidos.");
  if (values.some((value) => value < min || value > max)) {
    errors.push(`Los numeros deben estar entre ${min} y ${max}.`);
  }
  return { values, errors };
};

type UseTicketCreationOptions = {
  refreshInitialData: () => Promise<void>;
};

export function useTicketCreation({ refreshInitialData }: UseTicketCreationOptions) {
  const [drawType, setDrawType] = useState<DrawType>("PRIMITIVA");
  const [primitivaCoverageMode, setPrimitivaCoverageMode] = useState<PrimitivaCoverageMode>("SINGLE");
  const [drawDate, setDrawDate] = useState("");
  const [groupId, setGroupId] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [playsJoker, setPlaysJoker] = useState(false);
  const [jokerNumber, setJokerNumber] = useState("");
  const [lines, setLines] = useState<LineState[]>([createEmptyLine()]);
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const validation = useMemo(() => {
    const issues: string[] = [];
    if (!groupId) issues.push("Selecciona un grupo.");
    if (!drawDate) issues.push("Selecciona la fecha del sorteo.");
    if (receipt && !receipt.type.startsWith("image/")) issues.push("El resguardo debe ser una imagen.");
    if (priceInput.trim()) {
      const parsed = Number.parseFloat(priceInput.replace(",", "."));
      if (Number.isNaN(parsed)) issues.push("El precio debe ser un numero.");
      else if (parsed < 0) issues.push("El precio no puede ser negativo.");
      else if (Math.abs(parsed * 100 - Math.round(parsed * 100)) > 1e-6) issues.push("El precio debe tener como maximo 2 decimales.");
    }
    if (drawType === "PRIMITIVA" && playsJoker && !/^\d{7}$/.test(jokerNumber.trim())) {
      issues.push("El numero de Joker debe tener 7 digitos.");
    }
    const lineResults = lines.map((line) => {
      const lineIssues: string[] = [];
      const main = validateNumberSet(line.mainInput, drawType === "PRIMITIVA" ? 6 : 5, 1, drawType === "PRIMITIVA" ? 49 : 50);
      lineIssues.push(...main.errors.map((error) => `Numeros: ${error}`));
      let stars: number[] = [];
      if (drawType === "EUROMILLONES") {
        const star = validateNumberSet(line.starInput, 2, 1, 12);
        stars = star.values;
        lineIssues.push(...star.errors.map((error) => `Estrellas: ${error}`));
      }
      if (drawType === "PRIMITIVA" && line.complement.trim()) {
        const value = Number.parseInt(line.complement, 10);
        if (Number.isNaN(value)) lineIssues.push("Complementario debe ser un numero.");
        else if (value < 1 || value > 49) lineIssues.push("Complementario debe estar entre 1 y 49.");
        else if (main.values.includes(value)) lineIssues.push("Complementario no puede repetirse.");
      }
      if (drawType === "PRIMITIVA" && line.reintegro.trim()) {
        const value = Number.parseInt(line.reintegro, 10);
        if (Number.isNaN(value)) lineIssues.push("Reintegro debe ser un numero.");
        else if (value < 0 || value > 9) lineIssues.push("Reintegro debe estar entre 0 y 9.");
      }
      return { issues: lineIssues, main: main.values, stars };
    });
    if (lines.length === 0) issues.push("Debes añadir al menos una linea.");
    return { issues, lineResults, isValid: issues.length === 0 && lineResults.every((line) => line.issues.length === 0) };
  }, [drawDate, drawType, groupId, jokerNumber, lines, playsJoker, priceInput, receipt]);

  const handleLineChange = useCallback((index: number, patch: Partial<LineState>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }, []);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    setSaveSuccess(null);
    if (!validation.isValid || saving) return;
    setSaving(true);
    try {
      const parsedPrice = priceInput.trim() ? Number.parseFloat(priceInput.trim().replace(",", ".")) : null;
      const priceCents = parsedPrice === null || Number.isNaN(parsedPrice) ? undefined : Math.round(parsedPrice * 100);
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          drawType,
          drawDate,
          drawDates: drawType === "PRIMITIVA" && primitivaCoverageMode === "WEEKLY" ? getPrimitivaWeeklyDrawDates(drawDate) : undefined,
          priceCents,
          playsJoker: drawType === "PRIMITIVA" ? playsJoker : undefined,
          jokerNumber: drawType === "PRIMITIVA" && playsJoker ? jokerNumber.trim() : undefined,
          notes: notes.trim() || undefined,
          lines: lines.map((line) => ({
            mainNumbers: toIntArray(line.mainInput),
            starNumbers: drawType === "EUROMILLONES" ? toIntArray(line.starInput) : undefined,
            complement: line.complement ? Number.parseInt(line.complement, 10) : undefined,
            reintegro: line.reintegro ? Number.parseInt(line.reintegro, 10) : undefined,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const issues = Array.isArray(payload?.issues) ? payload.issues.join(" ") : payload?.error;
        throw new Error(issues || "No se pudo guardar el boleto.");
      }
      let successMessage = "Boleto guardado correctamente.";
      if (receipt) {
        const formData = new FormData();
        formData.append("ticketId", payload.data.id);
        formData.append("file", receipt);
        const uploadResponse = await fetch("/api/receipts", { method: "POST", body: formData });
        if (!uploadResponse.ok) {
          const uploadPayload = await uploadResponse.json();
          throw new Error(`${successMessage} ${uploadPayload?.error || "No se pudo subir el resguardo."}`);
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
      await refreshInitialData();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el boleto.");
    } finally {
      setSaving(false);
    }
  }, [drawDate, drawType, groupId, jokerNumber, lines, notes, playsJoker, priceInput, primitivaCoverageMode, receipt, refreshInitialData, saving, validation.isValid]);

  const selectedDraw: Draw | null = drawDate
    ? {
        id: `${drawType}-${drawDate}`,
        type: drawType,
        drawDate,
        label: `${drawType === "PRIMITIVA" ? "Primitiva" : "Euromillones"} · ${new Date(drawDate).toLocaleDateString("es-ES")}`,
      }
    : null;

  return {
    drawType,
    setDrawType,
    primitivaCoverageMode,
    setPrimitivaCoverageMode,
    drawDate,
    setDrawDate,
    groupId,
    setGroupId,
    priceInput,
    setPriceInput,
    playsJoker,
    setPlaysJoker,
    jokerNumber,
    setJokerNumber,
    lines,
    setLines,
    notes,
    setNotes,
    receipt,
    setReceipt,
    submitted,
    saving,
    saveError,
    saveSuccess,
    validation,
    selectedDraw,
    handleLineChange,
    handleSubmit,
    weeklyDrawDates: getPrimitivaWeeklyDrawDates,
    createEmptyLine,
  };
}
