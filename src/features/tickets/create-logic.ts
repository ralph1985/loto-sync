import type { DrawType } from "@/features/tickets/types";

export type CreateLineInput = {
  mainInput: string;
  starInput: string;
  complement: string;
  reintegro: string;
  elMillionCode?: string;
};

export type LineValidation = {
  issues: string[];
  main: number[];
  stars: number[];
};

export type TicketValidation = {
  issues: string[];
  lineResults: LineValidation[];
  isValid: boolean;
};

export type CreateTicketInput = {
  groupId: string;
  drawType: DrawType;
  drawDate: string;
  primitivaCoverageMode: "SINGLE" | "WEEKLY";
  euromillionsCoverageMode?: "SINGLE" | "WEEKLY";
  priceInput: string;
  playsJoker: boolean;
  jokerNumber: string;
  notes: string;
  lines: CreateLineInput[];
};

export const createEmptyLine = (): CreateLineInput => ({
  mainInput: "",
  starInput: "",
  complement: "",
  reintegro: "",
  elMillionCode: "",
});

export const getPrimitivaWeeklyDrawDates = (drawDate: string) => {
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

export const getEuromillionsWeeklyDrawDates = (drawDate: string) => {
  const source = new Date(`${drawDate}T00:00:00.000Z`);
  if (Number.isNaN(source.getTime())) return [];
  const weekday = source.getUTCDay();
  if (weekday !== 2 && weekday !== 5) return [drawDate];
  const first = new Date(source);
  if (weekday === 5) first.setUTCDate(first.getUTCDate() - 3);
  const second = new Date(first);
  second.setUTCDate(second.getUTCDate() + 3);
  return [first, second].map((value) => value.toISOString().slice(0, 10));
};

export const toIntArray = (input: string) =>
  input
    .split(/[\s,.-]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => !Number.isNaN(value));

const validateNumberSet = (
  input: string,
  expectedCount: number,
  min: number,
  max: number
) => {
  const values = toIntArray(input);
  const errors: string[] = [];
  if (values.length !== expectedCount) errors.push(`Necesitas ${expectedCount} numeros.`);
  if (new Set(values).size !== values.length) errors.push("Hay numeros repetidos.");
  if (values.some((value) => value < min || value > max)) {
    errors.push(`Los numeros deben estar entre ${min} y ${max}.`);
  }
  return { values, errors };
};

export const validateTicketInput = (
  input: Omit<CreateTicketInput, "notes" | "primitivaCoverageMode"> & {
    receiptType?: string | null;
    primitivaCoverageMode?: "SINGLE" | "WEEKLY";
  }
): TicketValidation => {
  const issues: string[] = [];
  if (!input.groupId) issues.push("Selecciona un grupo.");
  if (!input.drawDate) issues.push("Selecciona la fecha del sorteo.");
  if (input.receiptType && !input.receiptType.startsWith("image/")) {
    issues.push("El resguardo debe ser una imagen.");
  }
  if (input.priceInput.trim()) {
    const parsed = Number.parseFloat(input.priceInput.replace(",", "."));
    if (Number.isNaN(parsed)) issues.push("El precio debe ser un numero.");
    else if (parsed < 0) issues.push("El precio no puede ser negativo.");
    else if (Math.abs(parsed * 100 - Math.round(parsed * 100)) > 1e-6) {
      issues.push("El precio debe tener como maximo 2 decimales.");
    }
  }
  if (input.drawType === "PRIMITIVA" && input.playsJoker && !/^\d{7}$/.test(input.jokerNumber.trim())) {
    issues.push("El numero de Joker debe tener 7 digitos.");
  }

  const lineResults = input.lines.map((line) => {
    const lineIssues: string[] = [];
    const isPrimitiva = input.drawType === "PRIMITIVA";
    const main = validateNumberSet(line.mainInput, isPrimitiva ? 6 : 5, 1, isPrimitiva ? 49 : 50);
    lineIssues.push(...main.errors.map((error) => `Numeros: ${error}`));
    let stars: number[] = [];
    if (!isPrimitiva) {
      const star = validateNumberSet(line.starInput, 2, 1, 12);
      stars = star.values;
      lineIssues.push(...star.errors.map((error) => `Estrellas: ${error}`));
      if (line.elMillionCode?.trim() && !/^[A-Z]{3}\d{5}$/i.test(line.elMillionCode.trim())) {
        lineIssues.push("El Millón debe tener 3 letras y 5 cifras.");
      }
    } else if (line.elMillionCode?.trim()) {
      lineIssues.push("El código de El Millón solo aplica a Euromillones.");
    }
    if (isPrimitiva && line.complement.trim()) {
      const value = Number.parseInt(line.complement, 10);
      if (Number.isNaN(value)) lineIssues.push("Complementario debe ser un numero.");
      else if (value < 1 || value > 49) lineIssues.push("Complementario debe estar entre 1 y 49.");
      else if (main.values.includes(value)) lineIssues.push("Complementario no puede repetirse.");
    }
    if (isPrimitiva && line.reintegro.trim()) {
      const value = Number.parseInt(line.reintegro, 10);
      if (Number.isNaN(value)) lineIssues.push("Reintegro debe ser un numero.");
      else if (value < 0 || value > 9) lineIssues.push("Reintegro debe estar entre 0 y 9.");
    }
    return { issues: lineIssues, main: main.values, stars };
  });

  if (input.lines.length === 0) issues.push("Debes añadir al menos una linea.");
  return {
    issues,
    lineResults,
    isValid: issues.length === 0 && lineResults.every((line) => line.issues.length === 0),
  };
};

export const buildTicketPayload = (input: CreateTicketInput) => {
  const normalizedPrice = input.priceInput.trim().replace(",", ".");
  const parsedPrice = normalizedPrice ? Number.parseFloat(normalizedPrice) : null;
  const priceCents = parsedPrice === null || Number.isNaN(parsedPrice)
    ? undefined
    : Math.round(parsedPrice * 100);

  return {
    groupId: input.groupId,
    drawType: input.drawType,
    drawDate: input.drawDate,
    drawDates:
      input.drawType === "PRIMITIVA" && input.primitivaCoverageMode === "WEEKLY"
        ? getPrimitivaWeeklyDrawDates(input.drawDate)
        : input.drawType === "EUROMILLONES" && input.euromillionsCoverageMode === "WEEKLY"
          ? getEuromillionsWeeklyDrawDates(input.drawDate)
        : undefined,
    priceCents,
    playsJoker: input.drawType === "PRIMITIVA" ? input.playsJoker : undefined,
    jokerNumber: input.drawType === "PRIMITIVA" && input.playsJoker ? input.jokerNumber.trim() : undefined,
    notes: input.notes.trim() || undefined,
    lines: input.lines.map((line) => ({
      mainNumbers: toIntArray(line.mainInput),
      starNumbers: input.drawType === "EUROMILLONES" ? toIntArray(line.starInput) : undefined,
      complement: line.complement ? Number.parseInt(line.complement, 10) : undefined,
      reintegro: line.reintegro ? Number.parseInt(line.reintegro, 10) : undefined,
      elMillionCode: input.drawType === "EUROMILLONES" && line.elMillionCode?.trim()
        ? line.elMillionCode.trim().toUpperCase()
        : undefined,
    })),
  };
};
