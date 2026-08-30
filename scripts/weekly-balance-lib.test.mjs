import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeekWindow, sumAmounts, summarizeMovements, toDateKey, zonedDateTimeUtc, zonedMidnightUtc } from './weekly-balance-lib.mjs';

test('builds a Sunday 14:00-to-Sunday 14:00 Madrid week', () => {
  const window = getWeekWindow('2026-08-30');

  assert.equal(window.key, '2026-08-23');
  assert.equal(window.startDate, '2026-08-23');
  assert.equal(window.endDate, '2026-08-30');
  assert.equal(window.start.toISOString(), '2026-08-23T12:00:00.000Z');
  assert.equal(window.end.toISOString(), '2026-08-30T12:00:00.000Z');
});

test('uses the correct offset when Madrid is on winter time', () => {
  assert.equal(zonedMidnightUtc('2026-01-05').toISOString(), '2026-01-04T23:00:00.000Z');
  assert.equal(zonedDateTimeUtc('2026-01-04', '14:00:00').toISOString(), '2026-01-04T13:00:00.000Z');
});

test('uses an exclusive 14:00 boundary for the following Sunday', () => {
  const window = getWeekWindow('2026-08-31');

  assert.equal(window.start.toISOString(), '2026-08-23T12:00:00.000Z');
  assert.equal(window.end.toISOString(), '2026-08-30T12:00:00.000Z');
});

test('gets the local Madrid date and sums movements', () => {
  assert.equal(toDateKey(new Date('2026-08-23T22:30:00.000Z')), '2026-08-24');
  assert.equal(sumAmounts([{ amountCents: 2000 }, { amountCents: -350 }, { amountCents: 125 }]), 1775);
});

test('summarizes income, expenses, prizes and adjustments separately', () => {
  assert.deepEqual(summarizeMovements([
    { type: 'TICKET_EXPENSE', amountCents: -500 },
    { type: 'PRIZE', amountCents: 900 },
    { type: 'CONTRIBUTION', amountCents: 1000 },
    { type: 'ADJUSTMENT', amountCents: -25 }
  ]), {
    operations: 4,
    contributionsCents: 1000,
    expensesCents: 500,
    prizesCents: 900,
    adjustmentsCents: -25,
    inflowsCents: 1900,
    outflowsCents: 525,
    netCents: 1375
  });
});
