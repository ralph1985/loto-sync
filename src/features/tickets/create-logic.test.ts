import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTicketPayload,
  getPrimitivaWeeklyDrawDates,
  validateTicketInput,
} from "./create-logic.ts";

const primitivaLine = {
  mainInput: "1 2 3 4 5 6",
  starInput: "",
  complement: "7",
  reintegro: "3",
};

test("valida una línea de Primitiva y sus extras", () => {
  const result = validateTicketInput({
    groupId: "group-1",
    drawType: "PRIMITIVA",
    drawDate: "2026-08-10",
    priceInput: "2,50",
    playsJoker: true,
    jokerNumber: "1234567",
    lines: [primitivaLine],
  });
  assert.equal(result.isValid, true);
  assert.deepEqual(result.lineResults[0]?.main, [1, 2, 3, 4, 5, 6]);
});

test("rechaza números repetidos, Joker inválido y complementario duplicado", () => {
  const result = validateTicketInput({
    groupId: "group-1",
    drawType: "PRIMITIVA",
    drawDate: "2026-08-10",
    priceInput: "2.999",
    playsJoker: true,
    jokerNumber: "123",
    lines: [{ ...primitivaLine, mainInput: "1 1 3 4 5 6", complement: "1" }],
  });
  assert.equal(result.isValid, false);
  assert.ok(result.issues.includes("El precio debe tener como maximo 2 decimales."));
  assert.ok(result.issues.includes("El numero de Joker debe tener 7 digitos."));
  assert.ok(result.lineResults[0]?.issues.includes("Numeros: Hay numeros repetidos."));
  assert.ok(result.lineResults[0]?.issues.includes("Complementario no puede repetirse."));
});

test("construye payload de Euromillones sin campos de Primitiva", () => {
  const payload = buildTicketPayload({
    groupId: "group-1",
    drawType: "EUROMILLONES",
    drawDate: "2026-08-11",
    primitivaCoverageMode: "WEEKLY",
    priceInput: "2,00",
    playsJoker: true,
    jokerNumber: "1234567",
    notes: "  compartido  ",
    lines: [{ mainInput: "1 2 3 4 5", starInput: "1 2", complement: "7", reintegro: "3" }],
  });
  assert.equal(payload.priceCents, 200);
  assert.equal(payload.drawDates, undefined);
  assert.equal(payload.playsJoker, undefined);
  assert.equal(payload.notes, "compartido");
  assert.deepEqual(payload.lines[0]?.starNumbers, [1, 2]);
});

test("calcula la cobertura semanal L-J-S", () => {
  assert.deepEqual(getPrimitivaWeeklyDrawDates("2026-08-10"), [
    "2026-08-10",
    "2026-08-13",
    "2026-08-15",
  ]);
});
