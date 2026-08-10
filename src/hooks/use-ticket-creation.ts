"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";

import type { Draw, DrawType, PrimitivaCoverageMode } from "@/features/tickets/types";
import type { LineState } from "@/components/create/ticket-lines-editor";
import {
  buildTicketPayload,
  createEmptyLine,
  getPrimitivaWeeklyDrawDates,
  validateTicketInput,
} from "@/features/tickets/create-logic";

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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [receiptRetry, setReceiptRetry] = useState<{ ticketId: string; file: File } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const validation = useMemo(
    () => validateTicketInput({
      groupId,
      drawType,
      drawDate,
      priceInput,
      playsJoker,
      jokerNumber,
      lines,
      receiptType: receipt?.type,
      primitivaCoverageMode,
    }),
    [drawDate, drawType, groupId, jokerNumber, lines, playsJoker, priceInput, primitivaCoverageMode, receipt]
  );

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
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildTicketPayload({
          groupId,
          drawType,
          drawDate,
          primitivaCoverageMode,
          priceInput,
          playsJoker,
          jokerNumber,
          notes,
          lines,
        })),
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
          setReceiptRetry({ ticketId: payload.data.id, file: receipt });
          setLines([createEmptyLine()]);
          setNotes("");
          setPriceInput("");
          setPlaysJoker(false);
          setJokerNumber("");
          setPrimitivaCoverageMode("SINGLE");
          setReceipt(null);
          setAdvancedOpen(false);
          setSubmitted(false);
          throw new Error(`Boleto guardado, pero no se pudo subir el resguardo. ${uploadPayload?.error || "Puedes reintentarlo sin duplicar el boleto."}`);
        }
        successMessage = "Boleto y resguardo guardados correctamente.";
      }
      setSaveSuccess(successMessage);
      setReceiptRetry(null);
      setLines([createEmptyLine()]);
      setNotes("");
      setPriceInput("");
      setPlaysJoker(false);
      setJokerNumber("");
      setPrimitivaCoverageMode("SINGLE");
      setReceipt(null);
      setAdvancedOpen(false);
      setSubmitted(false);
      await refreshInitialData();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el boleto.");
    } finally {
      setSaving(false);
    }
  }, [drawDate, drawType, groupId, jokerNumber, lines, notes, playsJoker, priceInput, primitivaCoverageMode, receipt, refreshInitialData, saving, validation.isValid]);

  const retryReceiptUpload = useCallback(async () => {
    if (!receiptRetry || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const formData = new FormData();
      formData.append("ticketId", receiptRetry.ticketId);
      formData.append("file", receiptRetry.file);
      const response = await fetch("/api/receipts", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo subir el resguardo.");
      }
      setReceiptRetry(null);
      setReceipt(null);
      setSaveSuccess("Resguardo añadido correctamente.");
      await refreshInitialData();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo subir el resguardo.");
    } finally {
      setSaving(false);
    }
  }, [receiptRetry, refreshInitialData, saving]);

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
    advancedOpen,
    setAdvancedOpen,
    receiptRetry,
    submitted,
    saving,
    saveError,
    saveSuccess,
    validation,
    selectedDraw,
    handleLineChange,
    handleSubmit,
    retryReceiptUpload,
    weeklyDrawDates: getPrimitivaWeeklyDrawDates,
    createEmptyLine,
  };
}
