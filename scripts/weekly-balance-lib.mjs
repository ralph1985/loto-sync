const MADRID_TIME_ZONE = 'Europe/Madrid';

const madridDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MADRID_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const madridDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MADRID_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

export const toDateKey = (date) => {
  const parts = Object.fromEntries(madridDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const addDays = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const zonedMidnightUtc = (dateKey) => zonedDateTimeToUtc(dateKey, '00:00:00');

export const getWeekWindow = (reference = new Date()) => {
  const referenceKey = typeof reference === 'string' ? reference : toDateKey(reference);
  const day = new Date(`${referenceKey}T00:00:00.000Z`).getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const startDate = addDays(referenceKey, -daysSinceMonday);
  const endDate = addDays(startDate, 7);
  return {
    key: startDate,
    startDate,
    endDate,
    start: zonedMidnightUtc(startDate),
    end: zonedMidnightUtc(endDate)
  };
};

export const sumAmounts = (movements) => movements.reduce((total, movement) => total + movement.amountCents, 0);

export const formatDate = (dateKey) => new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'long',
  timeZone: 'UTC'
}).format(new Date(`${dateKey}T00:00:00.000Z`));

export const formatShortDate = (dateKey) => new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'short',
  timeZone: 'UTC'
}).format(new Date(`${dateKey}T00:00:00.000Z`));

function zonedDateTimeToUtc(dateKey, time) {
  const target = new Date(`${dateKey}T${time}.000Z`).getTime();
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(madridDateTimeFormatter.formatToParts(new Date(candidate)).map(({ type, value }) => [type, value]));
    const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    candidate = target - (localAsUtc - candidate);
  }
  return new Date(candidate);
}
