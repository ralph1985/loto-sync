import test from 'node:test';
import assert from 'node:assert/strict';
import { loadResultFilters, matchResultFilter, validateExtraction } from './results-parser.mjs';

const euroMessage = {
  subject: 'Resultados y escrutinio de Euromillones, martes, 11/08/2026',
  from: { value: [{ name: 'Loterias del Estado', address: 'envios@loteriasyapuestas.es' }] }
};

test('matches the real Euromillones message shape with default filters', () => {
  const filters = loadResultFilters({ RESULTS_IMAP_FROM: 'envios@loteriasyapuestas.es', RESULTS_IMAP_SUBJECT: 'Resultados y escrutinio de La Primitiva' });
  assert.equal(matchResultFilter(euroMessage, filters)?.game, 'EUROMILLONES');
});

test('matches a forwarded result using the original sender in the body', () => {
  const filters = loadResultFilters({ RESULTS_IMAP_FROM: 'envios@loteriasyapuestas.es', RESULTS_IMAP_SUBJECT: 'Resultados y escrutinio de La Primitiva' });
  const result = matchResultFilter({
    from: { value: [{ address: 'rafaelgarcia1985@hotmail.com' }] },
    subject: 'Fw: Resultados y escrutinio de Euromillones, martes, 11/08/2026',
    text: 'De: Loterias del Estado <envios@loteriasyapuestas.es>\nAsunto: Resultados y escrutinio de Euromillones'
  }, filters);
  assert.equal(result?.id, 'euromillones-resultados');
});

test('validates the Euromillones extraction from the provided email', () => {
  const result = validateExtraction({ date: '2026-08-11', numbers: [48, 17, 11, 3, 46], stars: [2, 1], elMillionCode: 'FFS91215' }, 'EUROMILLONES');
  assert.deepEqual(result, { game: 'EUROMILLONES', date: '2026-08-11', numbers: [48, 17, 11, 3, 46], stars: [2, 1], elMillionCode: 'FFS91215' });
});

test('rejects ambiguous filters', () => {
  const filters = loadResultFilters({ RESULTS_IMAP_FILTERS_JSON: JSON.stringify([
    { id: 'one', game: 'EUROMILLONES', from: ['envios@loteriasyapuestas.es'], subjectIncludes: ['Euromillones'], weekdays: [2, 5] },
    { id: 'two', game: 'EUROMILLONES', from: ['envios@loteriasyapuestas.es'], subjectIncludes: ['Resultados'], weekdays: [2, 5] }
  ]) });
  assert.throws(() => matchResultFilter(euroMessage, filters), /varios filtros/);
});
