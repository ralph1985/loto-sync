export function buildPrizeEmailPreview({ game, groupName, drawDate, totalCents, balanceCents }) {
  const gameLabel = game === 'PRIMITIVA' ? 'La Primitiva' : 'Euromillones';
  const amount = (cents) => (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const details = [`Premio: ${amount(totalCents)} €`];
  if (balanceCents !== null) details.push(`Bote: ${amount(balanceCents)} €`);
  return `${gameLabel} · ${groupName} · Sorteo ${drawDate} · ${details.join(' · ')}`;
}
