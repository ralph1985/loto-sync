"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { sortChecksByDate, toNumberArray } from "@/features/tickets/review-utils";
import type { PrimitivaCoverageMode, Ticket, TicketCheck, VerifyResponse } from "@/features/tickets/types";

const PRIMITIVA_DRAW_WEEKDAYS = new Set([1, 4, 6]);

const toDateInput = (value?: string | null) => {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
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

const inferPrimitivaCoverageMode = (ticket: Ticket): PrimitivaCoverageMode => {
  if (ticket.draw?.type !== "PRIMITIVA") return "SINGLE";
  const drawDate = toDateInput(ticket.draw.drawDate);
  if (!drawDate) return "SINGLE";
  const expectedWeekly = getPrimitivaWeeklyDrawDates(drawDate);
  const currentDates = sortChecksByDate(ticket.checks)
    .map((check) => toDateInput(check.drawDate))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
  return expectedWeekly.length === currentDates.length && expectedWeekly.every((date, index) => date === currentDates[index])
    ? "WEEKLY"
    : "SINGLE";
};

type UseReviewTicketActionsOptions = {
  selectedTicket: Ticket | null;
  setSelectedTicket: Dispatch<SetStateAction<Ticket | null>>;
  loadData: (forceRefresh?: boolean) => Promise<void>;
};

export function useReviewTicketActions({ selectedTicket, setSelectedTicket, loadData }: UseReviewTicketActionsOptions) {
  const [verifying, setVerifying] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [checkDrawDate, setCheckDrawDate] = useState("");
  const [manualPrizeInput, setManualPrizeInput] = useState("");
  const [savingPrize, setSavingPrize] = useState(false);
  const [prizeError, setPrizeError] = useState<string | null>(null);
  const [editingTicket, setEditingTicket] = useState(false);
  const [editTicketError, setEditTicketError] = useState<string | null>(null);
  const [editDrawDate, setEditDrawDate] = useState("");
  const [editPrimitivaCoverageMode, setEditPrimitivaCoverageMode] = useState<PrimitivaCoverageMode>("SINGLE");
  const [confirmingPurchase, setConfirmingPurchase] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [elMillionCodeInputs, setElMillionCodeInputs] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedTicket) {
      setEditDrawDate("");
      setEditPrimitivaCoverageMode("SINGLE");
      setEditTicketError(null);
      return;
    }
    setCheckDrawDate(toDateInput(selectedTicket.draw?.drawDate));
    setManualPrizeInput("");
    setElMillionCodeInputs(selectedTicket.lines?.map((line) => line.elMillionCode ?? "") ?? [selectedTicket.elMillionCode ?? ""]);
    setPurchaseError(null);
    setPrizeError(null);
    setEditDrawDate(toDateInput(selectedTicket.draw?.drawDate));
    setEditPrimitivaCoverageMode(inferPrimitivaCoverageMode(selectedTicket));
    setEditTicketError(null);
  }, [selectedTicket]);

  const handleSaveTicketDrawScope = useCallback(async () => {
    if (!selectedTicket?.draw) return;
    if (!editDrawDate) return setEditTicketError("Selecciona la fecha base del boleto.");
    const parsedBaseDate = new Date(`${editDrawDate}T00:00:00.000Z`);
    if (Number.isNaN(parsedBaseDate.getTime())) return setEditTicketError("La fecha base no es válida.");
    if (selectedTicket.draw.type === "PRIMITIVA" && !PRIMITIVA_DRAW_WEEKDAYS.has(parsedBaseDate.getUTCDay())) {
      return setEditTicketError("Primitiva solo admite lunes, jueves o sábado.");
    }
    setEditingTicket(true);
    setEditTicketError(null);
    try {
      const drawDates = selectedTicket.draw.type === "PRIMITIVA" && editPrimitivaCoverageMode === "WEEKLY"
        ? getPrimitivaWeeklyDrawDates(editDrawDate)
        : [editDrawDate];
      const response = await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: selectedTicket.id, drawDate: editDrawDate, drawDates }),
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
      setEditTicketError(error instanceof Error ? error.message : "No se pudo actualizar el boleto.");
    } finally {
      setEditingTicket(false);
    }
  }, [editDrawDate, editPrimitivaCoverageMode, loadData, selectedTicket, setSelectedTicket]);

  const handleConfirmPurchase = useCallback(async () => {
    if (!selectedTicket) return;
    setConfirmingPurchase(true);
    setPurchaseError(null);
    try {
      const response = await fetch(`/api/tickets/${selectedTicket.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elMillionCodes: elMillionCodeInputs }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "No se pudo confirmar la compra.");
      setSelectedTicket(payload.data);
      await loadData(true);
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "No se pudo confirmar la compra.");
    } finally {
      setConfirmingPurchase(false);
    }
  }, [elMillionCodeInputs, loadData, selectedTicket, setSelectedTicket]);

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
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : "Error al comprobar.");
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
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : "No se pudo recomprobar.");
    } finally {
      setRechecking(false);
    }
  }, [loadData, selectedTicket]);

  const handleSaveManualPrize = useCallback(async () => {
    if (!selectedTicket) return;
    setPrizeError(null);
    const parsed = Number.parseFloat(manualPrizeInput.replace(",", "."));
    if (Number.isNaN(parsed) || parsed < 0) return setPrizeError("Introduce un importe válido.");
    setSavingPrize(true);
    try {
      const response = await fetch("/api/results/prize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: selectedTicket.id, drawDate: checkDrawDate || undefined, prizeCents: Math.round(parsed * 100) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "No se pudo guardar.");
      await loadData(true);
    } catch (error) {
      setPrizeError(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSavingPrize(false);
    }
  }, [checkDrawDate, loadData, manualPrizeInput, selectedTicket]);

  const activeCheck: TicketCheck | null = verifyResult?.check ?? sortChecksByDate(selectedTicket?.checks).at(0) ?? null;
  const winningMainNumbers = useMemo(() => new Set(toNumberArray(activeCheck?.winningNumbers)), [activeCheck]);
  const winningStars = useMemo(() => new Set(toNumberArray(activeCheck?.winningStars)), [activeCheck]);

  return {
    verifying,
    rechecking,
    verifyError,
    verifyResult,
    setVerifyResult,
    setVerifyError,
    checkDrawDate,
    setCheckDrawDate,
    manualPrizeInput,
    setManualPrizeInput,
    savingPrize,
    prizeError,
    editingTicket,
    editTicketError,
    editDrawDate,
    setEditDrawDate,
    editPrimitivaCoverageMode,
    setEditPrimitivaCoverageMode,
    weeklyDrawDates: getPrimitivaWeeklyDrawDates,
    winningMainNumbers,
    winningStars,
    confirmingPurchase,
    purchaseError,
    elMillionCodeInputs,
    setElMillionCodeInputs,
    handleConfirmPurchase,
    handleSaveTicketDrawScope,
    handleVerifyTicket,
    handleRecheckTicket,
    handleSaveManualPrize,
  };
}
