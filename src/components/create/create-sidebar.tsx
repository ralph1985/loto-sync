import { NumberBadge } from "@/components/ui/number-badge";
import { RecentTickets } from "@/components/create/recent-tickets";
import type { LineState, LineValidation } from "@/components/create/ticket-lines-editor";
import { formatPrice } from "@/features/tickets/formatters";
import type { Draw, DrawType, Group, Ticket } from "@/features/tickets/types";

type CreateValidation = { lineResults: LineValidation[] };

type CreateSidebarProps = {
  drawType: DrawType;
  selectedDraw: Draw | null;
  groupId: string;
  groups: Group[];
  selectedGroupBalanceCents: number;
  priceInput: string;
  playsJoker: boolean;
  jokerNumber: string;
  lines: LineState[];
  validation: CreateValidation;
  latestTickets: Ticket[];
  loadingTickets: boolean;
  ticketsError: string | null;
  copiedTicketId: string | null;
  onCopyTicket: (ticket: Ticket) => void | Promise<void>;
  onSelectTicket: (ticket: Ticket) => void;
};

const CHECKLIST_ITEMS = [
  "Seleccion sorteo + grupo",
  "Validaciones por tipo de sorteo",
  "Alta con multiples lineas",
  "Resguardo opcional",
];

export function CreateSidebar({
  drawType,
  selectedDraw,
  groupId,
  groups,
  selectedGroupBalanceCents,
  priceInput,
  playsJoker,
  jokerNumber,
  lines,
  validation,
  latestTickets,
  loadingTickets,
  ticketsError,
  copiedTicketId,
  onCopyTicket,
  onSelectTicket,
}: CreateSidebarProps) {
  const selectedGroup = groups.find((group) => group.id === groupId);

  return (
    <aside className="animate-fade-up flex w-full flex-col gap-4 self-start lg:sticky lg:top-12 lg:max-w-md">
      <div className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
        <h3 className="text-lg font-bold tracking-tight text-slate-900">Resumen antes de guardar</h3>
        <p className="mt-1 text-sm text-slate-500">Vista rapida antes de guardar.</p>
        <div className="mt-4 space-y-4 text-sm text-slate-600">
          <SummaryItem label="Sorteo" value={selectedDraw?.label ?? (selectedDraw ? drawTypeLabel(selectedDraw.type) : "Sin definir")} />
          <SummaryItem label="Grupo" value={selectedGroup?.name ?? "Sin definir"} />
          <SummaryItem label="Bote grupo" value={groupId ? formatPrice(selectedGroupBalanceCents) : "Sin definir"} />
          <SummaryItem label="Fecha" value={selectedDraw?.drawDate ? new Date(selectedDraw.drawDate).toLocaleDateString("es-ES") : "Sin definir"} />
          <SummaryItem label="Precio" value={formatInputPrice(priceInput)} />
          <SummaryItem label="Joker" value={drawType === "PRIMITIVA" ? (playsJoker ? jokerNumber || "Pendiente" : "No") : "No aplica"} />
        </div>
        <div className="mt-6 space-y-4">
          {validation.lineResults.map((line, index) => (
            <div key={index} className="rounded-xl bg-slate-900 px-4 py-3 text-white">
              <p className="text-xs uppercase tracking-wide text-white/60">Linea {index + 1}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {line.main.length ? line.main.map((value, valueIndex) => (
                  <NumberBadge key={`${value}-${valueIndex}`} value={value} className="border-white/30 bg-white/20 text-white" />
                )) : <span className="text-sm text-white/60">Numeros pendientes</span>}
              </div>
              {drawType === "EUROMILLONES" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {line.stars.length ? line.stars.map((value, valueIndex) => (
                    <NumberBadge key={`star-${value}-${valueIndex}`} value={value} tone="accent" />
                  )) : <span className="text-sm text-white/60">Estrellas pendientes</span>}
                </div>
              ) : (
                <div className="mt-3 flex gap-3 text-xs text-white/70">
                  <span>Complementario: {lines[index]?.complement || "-"}</span>
                  <span>Reintegro: {lines[index]?.reintegro || "-"}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <GroupBalances groups={groups} />
      <Checklist />
      <RecentTickets
        tickets={latestTickets}
        loading={loadingTickets}
        error={ticketsError}
        copiedTicketId={copiedTicketId}
        onCopy={onCopyTicket}
        onSelect={onSelectTicket}
      />
    </aside>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span><p className="mt-1 font-semibold text-slate-900">{value}</p></div>;
}

function GroupBalances({ groups }: { groups: Group[] }) {
  return <>
    <details className="rounded-2xl border border-base-300 bg-base-100 p-4 text-sm text-slate-600 shadow-sm lg:hidden">
      <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-wide text-slate-400">Bote por grupo</summary>
      <BalanceList groups={groups} mobile />
    </details>
    <div className="hidden rounded-2xl border border-base-300 bg-base-100 p-5 text-sm text-slate-600 shadow-sm lg:block">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Bote por grupo</h4>
      <BalanceList groups={groups} />
    </div>
  </>;
}

function BalanceList({ groups, mobile = false }: { groups: Group[]; mobile?: boolean }) {
  return <div className="mt-3 space-y-2">
    {groups.length > 0 ? groups.map((group) => (
      <div key={`${mobile ? "mobile-" : ""}${group.id}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
        <span>{group.name}</span><span className="font-semibold">{formatPrice(group.balanceCents ?? 0)}</span>
      </div>
    )) : <p className="text-sm text-slate-500">Sin grupos.</p>}
  </div>;
}

function Checklist() {
  return <>
    <details className="rounded-2xl border border-base-300 bg-base-100 p-4 text-sm text-slate-600 shadow-sm lg:hidden">
      <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-wide text-slate-400">Checklist MVP</summary>
      <ChecklistItems />
    </details>
    <div className="hidden rounded-2xl border border-base-300 bg-base-100 p-5 text-sm text-slate-600 shadow-sm lg:block">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Checklist MVP</h4>
      <ChecklistItems />
    </div>
  </>;
}

function ChecklistItems() {
  return <ul className="mt-3 space-y-2">{CHECKLIST_ITEMS.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function drawTypeLabel(drawType: DrawType) {
  return drawType === "PRIMITIVA" ? "Primitiva" : "Euromillones";
}

function formatInputPrice(value: string) {
  if (!value.trim()) return "Sin definir";
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isNaN(parsed) ? "Precio invalido" : `${parsed.toFixed(2)} EUR`;
}
