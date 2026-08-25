import assert from 'node:assert/strict';
import test from 'node:test';
import {
  amountToCents,
  calculateLinePrize,
  normalizeApiResult,
  previousWeekDrawDates,
  sumLinePrizes
} from './weekly-prizes-lib.mjs';

test('calcula los sorteos de la semana anterior desde el domingo', () => {
  assert.deepEqual(previousWeekDrawDates(new Date('2026-08-23T08:00:00.000Z')), [
    { game: 'PRIMITIVA', date: '2026-08-17' },
    { game: 'EUROMILLONES', date: '2026-08-18' },
    { game: 'PRIMITIVA', date: '2026-08-20' },
    { game: 'EUROMILLONES', date: '2026-08-21' },
    { game: 'PRIMITIVA', date: '2026-08-22' }
  ]);
});

test('normaliza importes documentados en centimos', () => {
  assert.equal(amountToCents('12500000'), 12500000);
  assert.equal(amountToCents(250), 250);
  assert.equal(amountToCents(-1), null);
});

test('normaliza el resultado y su tabla de premios', () => {
  const result = normalizeApiResult({
    data: {
      drawDate: '2026-08-22',
      combination: [1, 2, 3, 4, 5, 6],
      resultData: { complementario: 7, reintegro: 8 },
      prizes: [{ categoryName: 'Reintegro', prizeAmount: '100' }]
    }
  }, 'PRIMITIVA', '2026-08-22');
  assert.deepEqual(result.numbers, [1, 2, 3, 4, 5, 6]);
  assert.equal(result.reintegro, 8);
  assert.equal(calculateLinePrize({ verification: { prizeCents: null }, result, game: 'PRIMITIVA', line: { reintegro: 8 } }), 100);
});

test('suma los premios de todas las lineas', () => {
  assert.equal(sumLinePrizes([{ prizeCents: 100 }, { prizeCents: 250 }]), 350);
});
