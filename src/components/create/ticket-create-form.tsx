import type { ChangeEvent, FormEvent } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import {
  TicketLinesEditor,
  type LineState,
  type LineValidation,
} from "@/components/create/ticket-lines-editor";
import type { Draw, DrawType, Group, PrimitivaCoverageMode } from "@/features/tickets/types";

export type { LineState } from "@/components/create/ticket-lines-editor";

type DrawOption = {
  id: DrawType;
  label: string;
  description: string;
};

type TicketValidation = {
  issues: string[];
  lineResults: LineValidation[];
  isValid: boolean;
};

type TicketCreateFormProps = {
  drawTypes: DrawOption[];
  drawType: DrawType;
  onDrawTypeChange: (value: DrawType) => void;
  groups: Group[];
  groupId: string;
  onGroupChange: (value: string) => void;
  loadingData: boolean;
  loadError: string | null;
  onRefreshData: () => void;
  drawDate: string;
  onDrawDateChange: (value: string) => void;
  coverageMode: PrimitivaCoverageMode;
  onCoverageModeChange: (value: PrimitivaCoverageMode) => void;
  euromillionsCoverageMode: "SINGLE" | "WEEKLY";
  onEuromillionsCoverageModeChange: (value: "SINGLE" | "WEEKLY") => void;
  euromillionsWeeklyDrawDates: (value: string) => string[];
  advancedOpen: boolean;
  onAdvancedToggle: () => void;
  weeklyDrawDates: (value: string) => string[];
  priceInput: string;
  onPriceChange: (value: string) => void;
  playsJoker: boolean;
  onPlaysJokerChange: (value: boolean) => void;
  jokerNumber: string;
  onJokerNumberChange: (value: string) => void;
  lines: LineState[];
  validation: TicketValidation;
  onAddLine: () => void;
  onRemoveLine: (index: number) => void;
  onLineChange: (index: number, patch: Partial<LineState>) => void;
  receipt: File | null;
  onReceiptChange: (file: File | null) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  selectedDraw: Draw | null;
  saving: boolean;
  submitted: boolean;
  saveSuccess: string | null;
  saveError: string | null;
  receiptRetry: { ticketId: string; file: File } | null;
  onRetryReceipt: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function TicketCreateForm({
  drawTypes,
  drawType,
  onDrawTypeChange,
  groups,
  groupId,
  onGroupChange,
  loadingData,
  loadError,
  onRefreshData,
  drawDate,
  onDrawDateChange,
  coverageMode,
  onCoverageModeChange,
  euromillionsCoverageMode,
  onEuromillionsCoverageModeChange,
  euromillionsWeeklyDrawDates,
  advancedOpen,
  onAdvancedToggle,
  weeklyDrawDates,
  priceInput,
  onPriceChange,
  playsJoker,
  onPlaysJokerChange,
  jokerNumber,
  onJokerNumberChange,
  lines,
  validation,
  onAddLine,
  onRemoveLine,
  onLineChange,
  receipt,
  onReceiptChange,
  notes,
  onNotesChange,
  selectedDraw,
  saving,
  submitted,
  saveSuccess,
  saveError,
  receiptRetry,
  onRetryReceipt,
  onSubmit,
}: TicketCreateFormProps) {
  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit} aria-busy={saving || loadingData}>
      <section className="animate-fade-up rounded-3xl border border-white/70 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Seleccion</h2>
        <p className="mt-1 text-sm text-slate-500">Define sorteo, grupo y fecha del boleto.</p>
        <div className="mt-3">
          <button type="button" onClick={onRefreshData} className="btn btn-xs btn-outline">
            Recargar datos
          </button>
        </div>
        {loadError ? <InlineAlert tone="error" className="mt-4">{loadError}</InlineAlert> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sorteo</span>
            <select
              value={drawType}
              onChange={(event) => onDrawTypeChange(event.target.value as DrawType)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
            >
              {drawTypes.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              {drawTypes.find((item) => item.id === drawType)?.description}
            </span>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grupo</span>
            <select
              value={groupId}
              onChange={(event) => onGroupChange(event.target.value)}
              disabled={loadingData || !!loadError}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none disabled:opacity-60"
            >
              <option value="">{loadingData ? "Cargando..." : "Selecciona grupo"}</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha sorteo</span>
            <input
              type="date"
              value={drawDate}
              onChange={(event) => onDrawDateChange(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Precio (EUR)</span>
            <input
              value={priceInput}
              onChange={(event) => onPriceChange(event.target.value)}
              placeholder="Ej: 2.00"
              inputMode="decimal"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>
        {drawType === "PRIMITIVA" && advancedOpen ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" checked={playsJoker} onChange={(event) => onPlaysJokerChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Jugar Joker
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Numero Joker</span>
              <input
                value={jokerNumber}
                onChange={(event) => onJokerNumberChange(event.target.value.replace(/\D/g, "").slice(0, 7))}
                placeholder="7 digitos"
                inputMode="numeric"
                disabled={!playsJoker}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none disabled:opacity-60"
              />
            </label>
          </div>
        ) : null}
      </section>

      <button
        type="button"
        onClick={onAdvancedToggle}
        aria-expanded={advancedOpen}
        className="flex items-center justify-between rounded-2xl border border-base-300 bg-base-100 px-4 py-3 text-left text-sm font-semibold text-base-content shadow-sm transition hover:border-primary"
      >
        <span>{advancedOpen ? "Ocultar opciones avanzadas" : "Mostrar opciones avanzadas"}</span>
        <span aria-hidden="true" className="text-lg leading-none">{advancedOpen ? "-" : "+"}</span>
      </button>

      {advancedOpen && drawType === "PRIMITIVA" ? (
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-base-content/70">Cobertura</span>
            <select
              value={coverageMode}
              onChange={(event) => onCoverageModeChange(event.target.value as PrimitivaCoverageMode)}
              className="select select-bordered w-full"
            >
              <option value="SINGLE">Solo este sorteo</option>
              <option value="WEEKLY">Semana completa (L-J-S)</option>
            </select>
            {drawDate && coverageMode === "WEEKLY" ? (
              <span className="text-xs text-base-content/70">
                Se aplicará a: {weeklyDrawDates(drawDate).map((value) => new Date(`${value}T00:00:00.000Z`).toLocaleDateString("es-ES")).join(" · ")}
              </span>
            ) : null}
          </label>
        </section>
      ) : null}
      {advancedOpen && drawType === "EUROMILLONES" ? (
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-base-content/70">Cobertura Euromillones</span>
            <select value={euromillionsCoverageMode} onChange={(event) => onEuromillionsCoverageModeChange(event.target.value as "SINGLE" | "WEEKLY")} className="select select-bordered w-full">
              <option value="SINGLE">Solo este sorteo</option>
              <option value="WEEKLY">Martes y viernes</option>
            </select>
            {drawDate && euromillionsCoverageMode === "WEEKLY" ? <span className="text-xs text-base-content/70">Se aplicará a: {euromillionsWeeklyDrawDates(drawDate).map((value) => new Date(`${value}T00:00:00.000Z`).toLocaleDateString("es-ES")).join(" · ")}</span> : null}
          </label>
        </section>
      ) : null}

      <TicketLinesEditor
        drawType={drawType}
        advancedOpen={advancedOpen}
        lines={lines}
        validation={validation.lineResults}
        onAddLine={() => {
          onAddLine();
          if (!advancedOpen) onAdvancedToggle();
        }}
        onRemoveLine={onRemoveLine}
        onLineChange={onLineChange}
      />

      {advancedOpen ? <section className="animate-fade-up rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Resguardo</h2>
        <p className="mt-1 text-sm text-slate-500">Opcional, pero recomendable para comprobaciones.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept="image/*"
            onChange={(event: ChangeEvent<HTMLInputElement>) => onReceiptChange(event.target.files?.[0] ?? null)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wide file:text-white"
          />
          {receipt ? <span className="text-xs text-slate-500">{receipt.name} ({Math.round(receipt.size / 1024)} KB)</span> : null}
        </div>
      </section> : null}

      {advancedOpen ? <section className="animate-fade-up rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas</label>
        <textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Ej: Boleto compartido con Marta y Luis." rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none" />
      </section> : null}

      <section className="sticky bottom-16 z-20 animate-fade-up rounded-3xl border border-white/70 bg-white/95 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6 lg:static">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-500">{selectedDraw?.label ?? "Sorteo"} · {lines.length} linea(s)</div>
          <button type="submit" disabled={!validation.isValid || saving || !!receiptRetry} className={`rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-wide transition ${validation.isValid && !saving && !receiptRetry ? "bg-slate-900 text-white hover:bg-slate-700" : "cursor-not-allowed bg-slate-200 text-slate-500"}`}>
            {saving ? "Guardando..." : receiptRetry ? "Resguardo pendiente" : "Guardar boleto"}
          </button>
        </div>
        {saveSuccess ? <InlineAlert tone="success" className="mt-4">{saveSuccess}</InlineAlert> : null}
        {saveError ? <InlineAlert tone="error" className="mt-4">{saveError}</InlineAlert> : null}
        {receiptRetry ? (
          <button type="button" onClick={onRetryReceipt} disabled={saving} className="btn btn-outline btn-sm mt-4">
            {saving ? "Subiendo resguardo..." : "Reintentar resguardo"}
          </button>
        ) : null}
        {submitted && !validation.isValid ? <InlineAlert tone="error" className="mt-4">Revisa las validaciones para continuar.</InlineAlert> : null}
      </section>
    </form>
  );
}
