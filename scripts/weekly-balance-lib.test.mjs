import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeekWindow, sumAmounts, toDateKey, zonedMidnightUtc } from './weekly-balance-lib.mjs';

test('builds a Monday-to-Monday Madrid week from a Sunday reference', () => {
  const window = getWeekWindow('2026-08-30');

  assert.equal(window.key, '2026-08-24');
  assert.equal(window.startDate, '2026-08-24');
  assert.equal(window.endDate, '2026-08-31');
  assert.equal(window.start.toISOString(), '2026-08-23T22:00:00.000Z');
  assert.equal(window.end.toISOString(), '2026-08-30T22:00:00.000Z');
});

test('uses the correct offset when Madrid is on winter time', () => {
  assert.equal(zonedMidnightUtc('2026-01-05').toISOString(), '2026-01-04T23:00:00.000Z');
});

test('gets the local Madrid date and sums movements', () => {
  assert.equal(toDateKey(new Date('2026-08-23T22:30:00.000Z')), '2026-08-24');
  assert.equal(sumAmounts([{ amountCents: 2000 }, { amountCents: -350 }, { amountCents: 125 }]), 1775);
});
