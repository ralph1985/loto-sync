import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrizeEmailPreview } from './prize-email-format.mjs';

test('builds a concise notification preview with group prize and balance', () => {
  assert.equal(buildPrizeEmailPreview({
    game: 'PRIMITIVA',
    groupName: 'Junta directiva KDC',
    drawDate: '2026-11-05',
    totalCents: 0,
    balanceCents: 3100
  }), 'La Primitiva · Junta directiva KDC · Sorteo 2026-11-05 · Premio: 0,00 € · Bote: 31,00 €');
});

test('omits the balance when balance tracking is disabled', () => {
  assert.equal(buildPrizeEmailPreview({
    game: 'EUROMILLONES',
    groupName: 'Grupo',
    drawDate: '2026-11-06',
    totalCents: 1250,
    balanceCents: null
  }), 'Euromillones · Grupo · Sorteo 2026-11-06 · Premio: 12,50 €');
});
