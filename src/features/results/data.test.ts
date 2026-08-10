import assert from "node:assert/strict";
import test from "node:test";

import { buildDisplayedResults, getRecentResults, type StoredResult } from "./data.ts";

const result = (game: StoredResult["game"], drawDate: string, id = drawDate): StoredResult => ({
  id,
  game,
  drawDate,
  numbers: [1, 2, 3],
  stars: [],
  complementario: null,
  reintegro: null,
  fetchedAt: `${drawDate}T22:00:00.000Z`,
});

test("selecciona los tres resultados más recientes por juego", () => {
  const results = [
    result("PRIMITIVA", "2026-08-01"),
    result("PRIMITIVA", "2026-08-08"),
    result("PRIMITIVA", "2026-08-15"),
    result("PRIMITIVA", "2026-08-22"),
    result("EUROMILLONES", "2026-08-04"),
  ];

  assert.deepEqual(
    getRecentResults(results, "PRIMITIVA").map((item) => item.drawDate),
    ["2026-08-22", "2026-08-15", "2026-08-08"]
  );
});

test("detecta sorteos de Primitiva faltantes hasta la fecha indicada", () => {
  const displayed = buildDisplayedResults(
    [result("PRIMITIVA", "2026-08-10")],
    "ALL",
    new Date("2026-08-15T12:00:00.000Z")
  );

  assert.deepEqual(
    displayed.filter((item) => item.isMissing).map((item) => item.drawDate),
    ["2026-08-15", "2026-08-13"]
  );
});

test("no añade huecos cuando solo se consulta Euromillones", () => {
  const displayed = buildDisplayedResults(
    [result("EUROMILLONES", "2026-08-11")],
    "EUROMILLONES",
    new Date("2026-08-15T12:00:00.000Z")
  );

  assert.equal(displayed.some((item) => item.isMissing), false);
});
