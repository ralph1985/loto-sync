const MADRID_TIME_ZONE = 'Europe/Madrid';

export const DRAW_SCHEDULE = {
  PRIMITIVA: [1, 4, 6],
  EUROMILLONES: [5]
};

export const scheduledDrawDate = (game, reference = new Date()) => {
  const yesterday = dateKeyToUtc(toDateKey(reference));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const date = yesterday.toISOString().slice(0, 10);
  const weekday = yesterday.getUTCDay();
  if (!DRAW_SCHEDULE[game]?.includes(weekday)) {
    throw new Error(`No hay sorteo de ${game} el día ${date}.`);
  }
  return { game, date };
};

export const toDateKey = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const dateKeyToUtc = (dateKey) => new Date(`${dateKey}T00:00:00.000Z`);

export const previousWeekDrawDates = (reference = new Date()) => {
  const madridKey = toDateKey(reference);
  const madridDate = dateKeyToUtc(madridKey);
  const day = madridDate.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(madridDate);
  // The Sunday run closes the Monday-Saturday period that is ending today.
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  const dates = [];

  for (const [game, weekdays] of Object.entries(DRAW_SCHEDULE)) {
    for (const weekday of weekdays) {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + weekday - 1);
      dates.push({ game, date: date.toISOString().slice(0, 10) });
    }
  }

  return dates.sort((left, right) => left.date.localeCompare(right.date));
};

const asObject = (value) => value && typeof value === 'object' ? value : {};

const asNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
};

export const amountToCents = (value) => {
  const amount = asNumber(value);
  if (amount === null || amount < 0) return null;
  // loteriasAPI documents prizeAmount in cents (e.g. 12500000 = 125000.00 EUR).
  return Number.isInteger(amount) ? amount : Math.round(amount * 100);
};

export const unwrapData = (payload) => {
  const root = asObject(payload);
  return Array.isArray(root.data) ? asObject(root.data[0]) : asObject(root.data ?? root);
};

export const normalizeApiResult = (payload, game, expectedDate) => {
  const data = unwrapData(payload);
  const resultData = asObject(data.resultData);
  const drawDate = String(data.drawDate ?? data.date ?? '').slice(0, 10);
  const numbers = data.combination ?? data.numbers;
  const stars = resultData.estrellas ?? resultData.stars ?? data.stars ?? [];
  if (drawDate !== expectedDate || !Array.isArray(numbers) || numbers.length === 0) {
    throw new Error(`Resultado incompleto para ${game} ${expectedDate}.`);
  }
  return {
    game,
    date: expectedDate,
    drawId: data.drawId ?? null,
    numbers: numbers.map(Number),
    stars: Array.isArray(stars) ? stars.map(Number) : [],
    complementario: asNumber(resultData.complementario),
    reintegro: asNumber(resultData.reintegro),
    elMillionCode: data.elMillionCode ?? resultData.elMillionCode ?? null,
    prizes: Array.isArray(data.prizes) ? data.prizes : []
  };
};

export const normalizeVerification = (payload) => {
  const data = unwrapData(payload);
  const prize = asObject(data.prize);
  const amount = amountToCents(prize.prizeAmount ?? prize.amount ?? data.prizeAmount);
  return {
    isWinner: data.isWinner === true || amount !== null,
    category: prize.categoryName ?? prize.category ?? null,
    prizeCents: amount,
    matchesMain: Number.isInteger(data.mainNumbersMatched) ? data.mainNumbersMatched : null,
    matchesExtra: Number.isInteger(data.extraNumbersMatched) ? data.extraNumbersMatched : null,
    matchedNumbers: Array.isArray(data.matchedNumbers) ? data.matchedNumbers : [],
    matchedExtraNumbers: Array.isArray(data.matchedExtraNumbers) ? data.matchedExtraNumbers : []
  };
};

export const calculateLinePrize = ({ verification, result, game, line }) => {
  if (verification.prizeCents !== null) return verification.prizeCents;

  // Some API responses expose the reintegro category only in the result table.
  if (game === 'PRIMITIVA' && line.reintegro !== null && line.reintegro === result.reintegro) {
    const reintegroPrize = result.prizes.find((prize) => /reintegro/i.test(String(prize.categoryName ?? '')));
    const amount = amountToCents(reintegroPrize?.prizeAmount ?? reintegroPrize?.amount);
    if (amount !== null) return amount;
  }

  if (verification.isWinner || (game === 'PRIMITIVA' && line.reintegro !== null && line.reintegro === result.reintegro)) {
    return null;
  }
  return 0;
};

const findPrizeAmount = (prizes, matcher) => {
  const prize = prizes.find((item) => matcher(String(item.categoryName ?? '')));
  return amountToCents(prize?.prizeAmount ?? prize?.amount);
};

export const calculatePrimitivaLinePrize = ({ result, line, numbers }) => {
  const matchesMain = numbers.filter((number) => result.numbers.includes(number)).length;
  const complementMatch = line.complement !== null && line.complement !== undefined && line.complement === result.complementario;
  const reintegroMatch = line.reintegro !== null && line.reintegro !== undefined && line.reintegro === result.reintegro;
  const categoryMatchers = {
    6: (name) => /6 Aciertos/.test(name) && !/\+ R/.test(name) && !/Especial/.test(name),
    5: (name) => /5 Aciertos/.test(name) && /\+ C/.test(name),
    4: (name) => /4 Aciertos/.test(name),
    3: (name) => /3 Aciertos/.test(name)
  };
  const baseMatcher = matchesMain === 5 && !complementMatch
    ? (name) => /5 Aciertos/.test(name) && !/\+ C/.test(name)
    : categoryMatchers[matchesMain];
  const baseAmount = matchesMain >= 3 ? findPrizeAmount(result.prizes, baseMatcher) : 0;
  const reintegroAmount = reintegroMatch ? findPrizeAmount(result.prizes, (name) => /Reintegro/i.test(name)) : 0;
  if (baseAmount === null || reintegroAmount === null) return null;
  return {
    prizeCents: baseAmount + reintegroAmount,
    category: [baseAmount > 0 ? `${matchesMain} aciertos${matchesMain === 5 && complementMatch ? ' + complementario' : ''}` : null, reintegroAmount > 0 ? 'reintegro' : null].filter(Boolean).join(' + ') || null,
    matchesMain,
    complementMatch,
    reintegroMatch
  };
};

export const sumLinePrizes = (lines) => lines.reduce((total, line) => total + line.prizeCents, 0);

export const buildResultPayload = (result) => ({
  success: true,
  data: {
    game: { slug: result.game === 'PRIMITIVA' ? 'primitiva' : 'euromillones' },
    drawDate: result.date,
    combination: result.numbers,
    resultData: {
      estrellas: result.stars,
      complementario: result.complementario,
      reintegro: result.reintegro,
      elMillionCode: result.elMillionCode
    },
    prizes: result.prizes
  },
  source: 'loteriasapi'
});
