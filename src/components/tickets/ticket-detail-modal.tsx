"use client";

import { ModalShell } from "@/components/ui/modal-shell";
import { buildDrawLabel, formatDate, formatPrice } from "@/features/tickets/formatters";
import type { Ticket } from "@/features/tickets/types";

type TicketDetailModalProps = {
  ticket: Ticket | null;
  onClose: () => void;
};

export function TicketDetailModal({ ticket, onClose }: TicketDetailModalProps) {
  if (!ticket) return null;

  return (
    <ModalShell
      open
      onClose={onClose}
      ariaLabel="Detalle del boleto"
      panelClassName="max-w-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
    >
      <div className="flex flex-col gap-3 pr-8 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            {ticket.group?.name ?? "Grupo"} · {ticket.status}
          </div>
          <h3 className="mt-1 text-2xl font-semibold text-slate-900">
            {buildDrawLabel(ticket.draw)}
          </h3>
          <p className="text-sm text-slate-500">{formatDate(ticket.createdAt)}</p>
          <p className="text-xs text-slate-500">
            {formatPrice(ticket.priceCents)} ·{" "}
            {ticket.playsJoker
              ? `Joker ${ticket.jokerNumber ?? "(sin numero)"}`
              : "Sin Joker"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Numeros
          </h4>
          <div className="mt-3 space-y-3">
            {(ticket.lines ?? []).map((line) => {
              const main = line.numbers
                .filter((number) => number.kind === "MAIN")
                .sort((a, b) => a.position - b.position)
                .map((number) => number.value);
              const stars = line.numbers
                .filter((number) => number.kind === "STAR")
                .sort((a, b) => a.position - b.position)
                .map((number) => number.value);

              return (
                <div key={line.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Linea {line.lineIndex}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {main.map((value, index) => (
                      <span
                        key={`${line.id}-main-${index}`}
                        className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
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
                          className="rounded-full bg-[#f9c784] px-3 py-1 text-xs font-semibold text-slate-900"
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
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Resguardo
          </h4>
          {ticket.receipt?.blobUrl ? (
            <div className="mt-3 space-y-3">
              <img
                src={ticket.receipt.blobUrl}
                alt="Resguardo"
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
      </div>
    </ModalShell>
  );
}
