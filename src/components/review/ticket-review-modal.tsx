import { ModalShell } from "@/components/ui/modal-shell";
import {
  buildDrawLabel,
  formatDate,
  formatDateTime,
  formatPrice,
  getMainNumbers,
  getStarNumbers,
} from "@/features/tickets/formatters";
import type {
  PrimitivaCoverageMode,
  Ticket,
  TicketCheck,
  VerifyResponse,
} from "@/features/tickets/types";

type TicketReviewModalProps = {
  ticket: Ticket | null;
  onClose: () => void;
  editDrawDate: string;
  onEditDrawDateChange: (value: string) => void;
  editCoverageMode: PrimitivaCoverageMode;
  onEditCoverageModeChange: (value: PrimitivaCoverageMode) => void;
  onSaveDrawScope: () => void;
  editingTicket: boolean;
  editTicketError: string | null;
  weeklyDrawDates: (value: string) => string[];
  checkDrawDate: string;
  onCheckDrawDateChange: (value: string) => void;
  onVerify: () => void;
  verifying: boolean;
  onRecheck: () => void;
  rechecking: boolean;
  verifyError: string | null;
  verifyResult: VerifyResponse | null;
  manualPrizeInput: string;
  onManualPrizeChange: (value: string) => void;
  onSavePrize: () => void;
  savingPrize: boolean;
  prizeError: string | null;
  winningMainNumbers: Set<number>;
  winningStars: Set<number>;
  confirmingPurchase: boolean;
  purchaseError: string | null;
  elMillionCodeInput: string;
  onElMillionCodeChange: (value: string) => void;
  onConfirmPurchase: () => void;
};

type TicketDrawScopeEditorProps = Pick<
  TicketReviewModalProps,
  | "ticket"
  | "editDrawDate"
  | "onEditDrawDateChange"
  | "editCoverageMode"
  | "onEditCoverageModeChange"
  | "onSaveDrawScope"
  | "editingTicket"
  | "editTicketError"
  | "weeklyDrawDates"
>;

function TicketDrawScopeEditor({
  ticket,
  editDrawDate,
  onEditDrawDateChange,
  editCoverageMode,
  onEditCoverageModeChange,
  onSaveDrawScope,
  editingTicket,
  editTicketError,
  weeklyDrawDates,
}: TicketDrawScopeEditorProps) {
  if (!ticket?.draw) return null;

  return (
    <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Configuración de sorteos del boleto
        </span>
        <button
          type="button"
          onClick={onSaveDrawScope}
          disabled={editingTicket}
          className="rounded-full border border-slate-300 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
        >
          {editingTicket ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Fecha base
          </span>
          <input
            type="date"
            value={editDrawDate}
            onChange={(event) => onEditDrawDateChange(event.target.value)}
            className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-700"
          />
        </label>
        {ticket.draw.type === "PRIMITIVA" ? (
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Cobertura
            </span>
            <select
              value={editCoverageMode}
              onChange={(event) =>
                onEditCoverageModeChange(event.target.value as PrimitivaCoverageMode)
              }
              className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-700"
            >
              <option value="SINGLE">Solo este sorteo</option>
              <option value="WEEKLY">Semana completa (L-J-S)</option>
            </select>
          </label>
        ) : null}
      </div>
      {ticket.draw.type === "PRIMITIVA" &&
      editCoverageMode === "WEEKLY" &&
      editDrawDate ? (
        <p className="mt-2 text-xs text-slate-500">
          Se aplicará a:{" "}
          {weeklyDrawDates(editDrawDate)
            .map((value) => new Date(`${value}T00:00:00.000Z`).toLocaleDateString("es-ES"))
            .join(" · ")}
        </p>
      ) : null}
      {editTicketError ? <p className="mt-2 text-xs text-rose-700">{editTicketError}</p> : null}
    </div>
  );
}

type TicketVerificationPanelProps = Pick<
  TicketReviewModalProps,
  | "ticket"
  | "checkDrawDate"
  | "onCheckDrawDateChange"
  | "onVerify"
  | "verifying"
  | "onRecheck"
  | "rechecking"
  | "verifyError"
  | "verifyResult"
  | "manualPrizeInput"
  | "onManualPrizeChange"
  | "onSavePrize"
  | "savingPrize"
  | "prizeError"
>;

function TicketVerificationPanel({
  ticket,
  checkDrawDate,
  onCheckDrawDateChange,
  onVerify,
  verifying,
  onRecheck,
  rechecking,
  verifyError,
  verifyResult,
  manualPrizeInput,
  onManualPrizeChange,
  onSavePrize,
  savingPrize,
  prizeError,
}: TicketVerificationPanelProps) {
  if (!ticket) return null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <span>Comprobación de premio (base local)</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="Fecha de comprobación"
            value={checkDrawDate}
            onChange={(event) => onCheckDrawDateChange(event.target.value)}
            className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600"
          />
          <button
            type="button"
            disabled={rechecking}
            onClick={onVerify}
            className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
          >
            {verifying ? "Comprobando..." : "Comprobar"}
          </button>
          <button
            type="button"
            disabled={verifying}
            onClick={onRecheck}
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
                verifyResult.matches?.stars ? ` + ${verifyResult.matches.stars} estrellas` : ""
              }`}
        </div>
      ) : null}

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Premio manual (EUR):</span>
          <input
            aria-label="Premio manual en euros"
            value={manualPrizeInput}
            onChange={(event) => onManualPrizeChange(event.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="w-24 rounded-full border border-slate-300 px-3 py-1 text-[11px] text-slate-700"
          />
          <button
            type="button"
            disabled={savingPrize}
            onClick={onSavePrize}
            className="rounded-full border border-slate-300 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
          >
            {savingPrize ? "Guardando..." : "Guardar premio"}
          </button>
        </div>
        {prizeError ? <p className="mt-2 text-xs text-rose-700">{prizeError}</p> : null}
      </div>
    </div>
  );
}

function TicketNumbersPanel({
  ticket,
  winningMainNumbers,
  winningStars,
}: {
  ticket: Ticket;
  winningMainNumbers: Set<number>;
  winningStars: Set<number>;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Números</h4>
      <div className="mt-3 space-y-3">
        {(ticket.lines ?? []).map((line) => {
          const main = getMainNumbers(line);
          const stars = getStarNumbers(line);
          return (
            <div key={line.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
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
                  Complementario: {line.complement ?? "-"} · Reintegro: {line.reintegro ?? "-"}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <TicketChecksList checks={ticket.checks} />
    </div>
  );
}

function TicketChecksList({ checks }: { checks?: TicketCheck[] }) {
  if (!checks?.length) return null;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Historial de comprobaciones
      </p>
      <div className="mt-2 space-y-1 text-xs text-slate-600">
        {[...checks]
          .sort((a, b) => new Date(b.drawDate).getTime() - new Date(a.drawDate).getTime())
          .map((check) => (
            <div key={check.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {formatDate(check.drawDate)} · {check.status} · {check.matchesMain}
                {check.matchesStars ? ` + ${check.matchesStars} estrellas` : ""}
              </span>
              <span>{formatPrice(check.prizeCents ?? null)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function TicketReceiptPanel({ ticket }: { ticket: Ticket }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resguardo</h4>
      {ticket.receipt?.blobUrl ? (
            <div className="mt-3 space-y-3">
              {/* Receipt URLs are dynamic storage/blob URLs; next/image cannot whitelist them safely. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ticket.receipt.blobUrl}
                alt="Resguardo"
                loading="lazy"
                decoding="async"
                className="w-full rounded-2xl border border-slate-200 object-cover"
          />
          <a
            href={ticket.receipt.blobUrl}
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Abrir imagen
          </a>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No hay resguardo adjunto.</p>
      )}
    </div>
  );
}

export function TicketReviewModal({
  ticket,
  onClose,
  editDrawDate,
  onEditDrawDateChange,
  editCoverageMode,
  onEditCoverageModeChange,
  onSaveDrawScope,
  editingTicket,
  editTicketError,
  weeklyDrawDates,
  checkDrawDate,
  onCheckDrawDateChange,
  onVerify,
  verifying,
  onRecheck,
  rechecking,
  verifyError,
  verifyResult,
  manualPrizeInput,
  onManualPrizeChange,
  onSavePrize,
  savingPrize,
  prizeError,
  winningMainNumbers,
  winningStars,
  confirmingPurchase,
  purchaseError,
  elMillionCodeInput,
  onElMillionCodeChange,
  onConfirmPurchase,
}: TicketReviewModalProps) {
  if (!ticket) return null;

  return (
    <ModalShell
      open
      onClose={onClose}
      ariaLabel="Detalle del boleto"
      panelClassName="max-w-4xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
    >
      {ticket.purchaseStatus === "PENDING_CONFIRMATION" ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Compra pendiente de confirmar</p>
          <p className="mt-1 text-xs text-amber-800">Introduce el código de El Millón del resguardo cuando hayas comprado este boleto.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input className="input input-bordered input-sm" placeholder="ABC12345" value={elMillionCodeInput} onChange={(event) => onElMillionCodeChange(event.target.value.toUpperCase())} />
            <button type="button" className="btn btn-sm btn-primary" disabled={confirmingPurchase} onClick={onConfirmPurchase}>{confirmingPurchase ? "Guardando…" : "Confirmar compra"}</button>
          </div>
          {purchaseError ? <p className="mt-2 text-xs text-error">{purchaseError}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 pr-8 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            {ticket.group?.name ?? "Grupo"} · {ticket.status}
          </div>
          <h3 className="mt-1 text-2xl font-semibold text-slate-900">{buildDrawLabel(ticket.draw)}</h3>
          <p className="text-sm text-slate-500">{formatDateTime(ticket.createdAt)}</p>
          <p className="text-xs text-slate-500">
            {formatPrice(ticket.priceCents)} ·{" "}
            {ticket.draw?.type === "PRIMITIVA"
              ? ticket.playsJoker
                ? `Joker ${ticket.jokerNumber ?? "-"}`
                : "Sin Joker"
              : "Joker no aplica"}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <TicketDrawScopeEditor
          ticket={ticket}
          editDrawDate={editDrawDate}
          onEditDrawDateChange={onEditDrawDateChange}
          editCoverageMode={editCoverageMode}
          onEditCoverageModeChange={onEditCoverageModeChange}
          onSaveDrawScope={onSaveDrawScope}
          editingTicket={editingTicket}
          editTicketError={editTicketError}
          weeklyDrawDates={weeklyDrawDates}
        />
        <TicketVerificationPanel
          ticket={ticket}
          checkDrawDate={checkDrawDate}
          onCheckDrawDateChange={onCheckDrawDateChange}
          onVerify={onVerify}
          verifying={verifying}
          onRecheck={onRecheck}
          rechecking={rechecking}
          verifyError={verifyError}
          verifyResult={verifyResult}
          manualPrizeInput={manualPrizeInput}
          onManualPrizeChange={onManualPrizeChange}
          onSavePrize={onSavePrize}
          savingPrize={savingPrize}
          prizeError={prizeError}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <TicketNumbersPanel
          ticket={ticket}
          winningMainNumbers={winningMainNumbers}
          winningStars={winningStars}
        />
        <TicketReceiptPanel ticket={ticket} />
      </div>
    </ModalShell>
  );
}
