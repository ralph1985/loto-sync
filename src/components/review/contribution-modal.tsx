import { ModalShell } from "@/components/ui/modal-shell";
import { formatPrice } from "@/features/tickets/formatters";

type ContributionModalProps = {
  open: boolean;
  groupName: string;
  balanceCents: number | null;
  amount: string;
  note: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onAmountChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
};

export function ContributionModal({
  open,
  groupName,
  balanceCents,
  amount,
  note,
  saving,
  error,
  onClose,
  onAmountChange,
  onNoteChange,
  onSubmit,
}: ContributionModalProps) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      closeDisabled={saving}
      ariaLabel="Recargar bote"
      panelClassName="max-w-md border border-slate-200 bg-white p-0 shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
    >
      <form
        className="w-full p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="mb-5 pr-8">
          <h3 className="text-lg font-semibold text-slate-900">Recargar bote</h3>
          <p className="mt-1 text-sm text-slate-500">{groupName}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Bote actual: {formatPrice(balanceCents)}
          </p>
        </div>

        <div className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Importe
            </span>
            <input
              id="contribution-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="10,00"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              disabled={saving}
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Nota opcional
            </span>
            <textarea
              id="contribution-note"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              className="min-h-24 resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              disabled={saving}
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full border border-emerald-600 bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar aportacion"}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
