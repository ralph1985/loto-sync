import type { TicketCheck } from "@/features/tickets/types";

export const formatDrawChip = (value?: string | null) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  const weekday = date.toLocaleDateString("es-ES", { weekday: "short" });
  const day = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
  });
  return `${weekday.replace(".", "")} ${day}`;
};

export const toNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "number"
        ? item
        : typeof item === "string"
        ? Number.parseInt(item, 10)
        : NaN
    )
    .filter((item) => Number.isFinite(item));
};

export const sortChecksByDate = (checks?: TicketCheck[]) =>
  [...(checks ?? [])].sort(
    (a, b) => new Date(b.drawDate).getTime() - new Date(a.drawDate).getTime()
  );
