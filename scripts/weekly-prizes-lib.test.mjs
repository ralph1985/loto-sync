import assert from 'node:assert/strict';
import test from 'node:test';
import {
  amountToCents,
  calculateLinePrize,
  calculatePrimitivaLinePrize,
  normalizeApiResult,
  previousWeekDrawDates,
  scheduledDrawDate,
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

test('resuelve el sorteo del dia anterior para el cron', () => {
  assert.deepEqual(scheduledDrawDate('PRIMITIVA', new Date('2026-08-25T12:00:00.000Z')), {
    game: 'PRIMITIVA',
    date: '2026-08-24'
  });
  assert.deepEqual(scheduledDrawDate('EUROMILLONES', new Date('2026-08-26T12:00:00.000Z')), {
    game: 'EUROMILLONES',
    date: '2026-08-25'
  });
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

test('calcula 3 aciertos mas reintegro con la tabla de Primitiva', () => {
  const result = {
    numbers: [1, 2, 3, 4, 5, 6],
    complementario: 7,
    reintegro: 3,
    prizes: [
      { categoryName: '5ª (3 Aciertos)', prizeAmount: '800' },
      { categoryName: 'Reintegro', prizeAmount: '100' }
    ]
  };
  const calculated = calculatePrimitivaLinePrize({
    result,
    numbers: [1, 2, 3, 10, 11, 12],
    line: { complement: 7, reintegro: 3 }
  });
  assert.deepEqual(calculated, {
    prizeCents: 900,
    category: '3 aciertos + reintegro',
    matchesMain: 3,
    complementMatch: true,
    reintegroMatch: true
  });
});
