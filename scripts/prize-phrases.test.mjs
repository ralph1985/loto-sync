import assert from 'node:assert/strict';
import test from 'node:test';
import { fallbackPrizePhrase, generatePrizePhrase, generatePrizePhrases, normalizePhrase } from './prize-phrases.mjs';

test('elige el tono de respaldo según el premio del boleto', () => {
  assert.match(fallbackPrizePhrase(0), /Champions/);
  assert.match(fallbackPrizePhrase(4999), /aperitivo/);
  assert.match(fallbackPrizePhrase(5000), /himno/);
});

test('si falla Codex, solo ese boleto usa la frase de respaldo', async () => {
  const calls = [];
  const phrases = await generatePrizePhrases([
    { ticketId: 'ticket-sin-premio', prizeCents: 0 },
    { ticketId: 'ticket-premiado', prizeCents: 6000 }
  ], {
    generate: async ({ prizeCents }) => {
      calls.push(prizeCents);
      if (prizeCents === 0) throw new Error('Codex no disponible');
      return '¡Esto ya pide vuelta de honor!';
    }
  });

  assert.deepEqual(calls.sort((left, right) => left - right), [0, 6000]);
  assert.equal(phrases.get('ticket-sin-premio'), fallbackPrizePhrase(0));
  assert.equal(phrases.get('ticket-premiado'), '¡Esto ya pide vuelta de honor!');
});

test('una respuesta vacía de Codex también activa el respaldo', async () => {
  assert.equal(
    await generatePrizePhrase({ prizeCents: 2500, generate: async () => '   ' }),
    fallbackPrizePhrase(2500)
  );
});

test('rechaza respuestas de Codex demasiado largas', () => {
  assert.equal(normalizePhrase('x'.repeat(141)), null);
});
