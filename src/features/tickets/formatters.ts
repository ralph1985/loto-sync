import type { Draw, TicketLine } from "@/features/tickets/types";

export const DRAW_LABELS = {
  PRIMITIVA: "Primitiva",
  EUROMILLONES: "Euromillones",
} as const;

export const formatDate = (value?: string | null) => {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleDateString("es-ES");
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleString("es-ES");
};

export const formatPrice = (priceCents?: number | null) => {
  if (priceCents === null || priceCents === undefined) return "Sin precio";
  return `${(priceCents / 100).toFixed(2)} EUR`;
};

export const buildDrawLabel = (draw?: Draw | null) => {
  if (!draw) return "Sorteo";
  return draw.label ?? `${DRAW_LABELS[draw.type]} · ${formatDate(draw.drawDate)}`;
};

export const getMainNumbers = (line?: TicketLine) =>
  line
    ? line.numbers
        .filter((number) => number.kind === "MAIN")
        .sort((a, b) => a.position - b.position)
        .map((number) => number.value)
    : [];

export const getStarNumbers = (line?: TicketLine) =>
  line
    ? line.numbers
        .filter((number) => number.kind === "STAR")
        .sort((a, b) => a.position - b.position)
        .map((number) => number.value)
    : [];
