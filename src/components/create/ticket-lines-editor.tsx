import type { DrawType } from "@/features/tickets/types";

export type LineState = {
  mainInput: string;
  starInput: string;
  complement: string;
  reintegro: string;
};

export type LineValidation = {
  issues: string[];
  main: number[];
  stars: number[];
};

type TicketLinesEditorProps = {
  drawType: DrawType;
  lines: LineState[];
  validation: LineValidation[];
  onAddLine: () => void;
  onRemoveLine: (index: number) => void;
  onLineChange: (index: number, patch: Partial<LineState>) => void;
};

export function TicketLinesEditor({
  drawType,
  lines,
  validation,
  onAddLine,
  onRemoveLine,
  onLineChange,
}: TicketLinesEditorProps) {
  return (
    <section className="animate-fade-up rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Numeros</h2>
          <p className="mt-1 text-sm text-slate-500">Usa comas o espacios para separar numeros.</p>
        </div>
        <button
          type="button"
          onClick={onAddLine}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
        >
          + Linea
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-6">
        {lines.map((line, index) => {
          const lineValidation = validation[index];
          return (
            <div key={index} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Linea {index + 1}
                </span>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onRemoveLine(index)}
                    className="text-xs font-semibold uppercase tracking-wide text-slate-400 transition hover:text-slate-600"
                  >
                    Quitar
                  </button>
                ) : null}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Numeros principales
                  </span>
                  <input
                    value={line.mainInput}
                    onChange={(event) => onLineChange(index, { mainInput: event.target.value })}
                    placeholder={
                      drawType === "PRIMITIVA"
                        ? "Ej: 4 9 13 28 33 41"
                        : "Ej: 7 18 24 33 49"
                    }
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                  />
                </label>

                {drawType === "EUROMILLONES" ? (
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Estrellas
                    </span>
                    <input
                      value={line.starInput}
                      onChange={(event) => onLineChange(index, { starInput: event.target.value })}
                      placeholder="Ej: 2 11"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                  </label>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Complementario
                      </span>
                      <input
                        value={line.complement}
                        onChange={(event) => onLineChange(index, { complement: event.target.value })}
                        placeholder="Ej: 12"
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Reintegro
                      </span>
                      <input
                        value={line.reintegro}
                        onChange={(event) => onLineChange(index, { reintegro: event.target.value })}
                        placeholder="Ej: 6"
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      />
                    </label>
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
  );
}
