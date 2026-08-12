const DEFAULT_EUROMILLONES_SUBJECT = 'Resultados y escrutinio de Euromillones';

const WEEKDAYS_BY_GAME = {
  PRIMITIVA: [1, 4, 6],
  EUROMILLONES: [2, 5]
};

export function loadResultFilters(env = process.env) {
  const raw = env.RESULTS_IMAP_FILTERS_JSON?.trim();
  const filters = raw
    ? parseConfiguredFilters(raw)
    : [
        {
          id: 'primitiva-resultados',
          game: 'PRIMITIVA',
          from: [env.RESULTS_IMAP_FROM ?? ''],
          subjectIncludes: [env.RESULTS_IMAP_SUBJECT_PRIMITIVA ?? env.RESULTS_IMAP_SUBJECT ?? ''],
          weekdays: WEEKDAYS_BY_GAME.PRIMITIVA
        },
        {
          id: 'euromillones-resultados',
          game: 'EUROMILLONES',
          from: [env.RESULTS_IMAP_FROM ?? ''],
          subjectIncludes: [env.RESULTS_IMAP_SUBJECT_EUROMILLONES ?? DEFAULT_EUROMILLONES_SUBJECT],
          weekdays: WEEKDAYS_BY_GAME.EUROMILLONES
        }
      ];

  validateFilters(filters);
  return filters.map((filter) => ({
    ...filter,
    from: filter.from.map(normalize),
    subjectIncludes: filter.subjectIncludes.map(normalize)
  }));
}

function parseConfiguredFilters(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('RESULTS_IMAP_FILTERS_JSON no contiene JSON valido.');
  }
  if (!Array.isArray(parsed)) throw new Error('RESULTS_IMAP_FILTERS_JSON debe ser un array.');
  return parsed;
}

function validateFilters(filters) {
  const ids = new Set();
  for (const filter of filters) {
    if (!filter || typeof filter !== 'object') throw new Error('Cada filtro de resultados debe ser un objeto.');
    if (!/^[a-z0-9-]+$/.test(filter.id ?? '') || ids.has(filter.id)) throw new Error('Cada filtro necesita un id unico en formato kebab-case.');
    ids.add(filter.id);
    if (filter.game !== 'PRIMITIVA' && filter.game !== 'EUROMILLONES') throw new Error(`Juego no soportado en filtro ${filter.id}.`);
    if (!Array.isArray(filter.from) || filter.from.length === 0 || filter.from.some((value) => typeof value !== 'string' || !value.trim())) throw new Error(`El filtro ${filter.id} necesita remitentes.`);
    if (!Array.isArray(filter.subjectIncludes) || filter.subjectIncludes.length === 0 || filter.subjectIncludes.some((value) => typeof value !== 'string' || !value.trim())) throw new Error(`El filtro ${filter.id} necesita asuntos.`);
    if (!Array.isArray(filter.weekdays) || filter.weekdays.some((value) => !Number.isInteger(value) || value < 0 || value > 6)) throw new Error(`Los dias del filtro ${filter.id} no son validos.`);
  }
}

export function matchResultFilter(parsed, filters) {
  const from = (parsed.from?.value ?? []).flatMap((item) => [item.address, item.name]).filter(Boolean).map(normalize);
  const subject = normalize(parsed.subject ?? '');
  const matches = filters.filter((filter) =>
    filter.from.some((expected) => from.includes(expected)) &&
    filter.subjectIncludes.some((expected) => subject.includes(expected))
  );
  if (matches.length > 1) throw new Error(`El correo coincide con varios filtros: ${matches.map((filter) => filter.id).join(', ')}.`);
  return matches[0] ?? null;
}

export function validateExtraction(value, game) {
  if (!value || typeof value !== 'object' || value.error) throw new Error('Resultado no determinable por Codex.');
  const date = typeof value.date === 'string' ? value.date : '';
  const numbers = Array.isArray(value.numbers) ? value.numbers : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('La fecha extraida no es valida.');
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  const weekdays = WEEKDAYS_BY_GAME[game];
  if (!weekdays || Number.isNaN(parsedDate.getTime()) || !weekdays.includes(parsedDate.getUTCDay())) throw new Error(`La fecha no corresponde a un sorteo de ${game}.`);
  const expectedNumbers = game === 'EUROMILLONES' ? 5 : 6;
  const maxNumber = game === 'EUROMILLONES' ? 50 : 49;
  if (numbers.length !== expectedNumbers || new Set(numbers).size !== expectedNumbers || numbers.some((item) => !Number.isInteger(item) || item < 1 || item > maxNumber)) throw new Error('La combinacion extraida no es valida.');
  if (game === 'EUROMILLONES') {
    const stars = Array.isArray(value.stars) ? value.stars : [];
    if (stars.length !== 2 || new Set(stars).size !== 2 || stars.some((item) => !Number.isInteger(item) || item < 1 || item > 12)) throw new Error('Las estrellas extraidas no son validas.');
    const elMillionCode = typeof value.elMillionCode === 'string' ? value.elMillionCode.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}\d{5}$/.test(elMillionCode)) throw new Error('El codigo de El Millon no es valido.');
    return { game, date, numbers, stars, elMillionCode };
  }
  const complementario = value.complementario === null || value.complementario === undefined ? null : Number(value.complementario);
  const reintegro = value.reintegro === null || value.reintegro === undefined ? null : Number(value.reintegro);
  if (complementario !== null && (!Number.isInteger(complementario) || complementario < 1 || complementario > 49 || numbers.includes(complementario))) throw new Error('El complementario no es valido.');
  if (reintegro !== null && (!Number.isInteger(reintegro) || reintegro < 0 || reintegro > 9)) throw new Error('El reintegro no es valido.');
  return { game, date, numbers, stars: [], complementario, reintegro, elMillionCode: null };
}

function normalize(value) {
  return String(value).trim().toLowerCase();
}
