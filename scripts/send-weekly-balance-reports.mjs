import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  addDays,
  formatDate,
  formatShortDate,
  getWeekWindow,
  summarizeMovements
} from './weekly-balance-lib.mjs';

const root = resolve(process.cwd());
const stateDir = resolve(root, 'var/weekly-balance');
const statePath = resolve(stateDir, 'state.json');
const args = parseArgs(process.argv.slice(2));
const dryRun = args.dryRun === true;

loadLocalEnvFiles(resolve(root, '.env.local'));
loadLocalEnvFiles(resolve(root, '.env'));

const required = ['DATABASE_URL'];
if (!dryRun) required.push('RESULTS_SMTP_PASSWORD or RESULTS_IMAP_PASSWORD');
const missing = required.filter((key) => key.includes(' or ')
  ? !process.env.RESULTS_SMTP_PASSWORD && !process.env.RESULTS_IMAP_PASSWORD
  : !process.env[key]);
if (missing.length > 0) throw new Error(`Faltan variables de configuración: ${missing.join(', ')}`);
if (process.env.DATABASE_URL.startsWith('file:')) throw new Error('DATABASE_URL debe apuntar a PostgreSQL remoto.');

const week = getWeekWindow(args.referenceDate ?? new Date());
const state = dryRun ? { sentWeeks: {} } : readState();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

try {
  const groups = await prisma.group.findMany({
    where: { balanceTrackingEnabled: true },
    select: {
      id: true,
      name: true,
      emailRecipients: {
        where: { enabled: true },
        orderBy: { email: 'asc' },
        select: { email: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  if (groups.length === 0) {
    console.log(`Weekly balance: no hay grupos con bote contabilizado para ${week.key}.`);
  } else {
    const groupIds = groups.map((group) => group.id);
    const [openingMovements, periodMovements] = await Promise.all([
      prisma.groupMovement.findMany({
        where: { groupId: { in: groupIds }, occurredAt: { lt: week.start } },
        select: { groupId: true, amountCents: true }
      }),
      prisma.groupMovement.findMany({
        where: { groupId: { in: groupIds }, occurredAt: { gte: week.start, lt: week.end } },
        orderBy: [{ groupId: 'asc' }, { occurredAt: 'asc' }],
        select: {
          id: true,
          groupId: true,
          type: true,
          amountCents: true,
          occurredAt: true,
          note: true,
          relatedTicketId: true,
          relatedCheckId: true
        }
      })
    ]);

    const movementDetails = await loadMovementDetails(periodMovements);
    const openingByGroup = sumByGroup(openingMovements);
    const sentGroups = state.sentWeeks[week.key] ?? {};
    let failures = 0;

    for (const group of groups) {
    if (sentGroups[group.id]) {
      console.log(`Weekly balance: ${group.name} ya enviado para ${week.key}.`);
      continue;
    }

    const report = {
      week,
      group,
      openingBalanceCents: openingByGroup.get(group.id) ?? 0,
      movements: movementDetails.filter((movement) => movement.groupId === group.id)
    };
    report.summary = summarizeMovements(report.movements);
    report.closingBalanceCents = report.openingBalanceCents + report.summary.netCents;

    if (dryRun) {
      console.log(buildTextReport(report));
      continue;
    }

    if (group.emailRecipients.length === 0) {
      failures += 1;
      console.error(`Weekly balance: ${group.name} no tiene destinatarios activos.`);
      continue;
    }

    try {
      await sendMail(report);
      sentGroups[group.id] = new Date().toISOString();
      state.sentWeeks[week.key] = sentGroups;
      writeState(state);
      console.log(`Weekly balance: informe enviado a ${group.name}.`);
    } catch (error) {
      failures += 1;
      console.error(`Weekly balance: no se pudo enviar a ${group.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    }

    if (failures > 0) throw new Error(`${failures} resumen(es) semanal(es) no se pudieron completar.`);
    console.log(`Weekly balance: semana ${week.startDate} a ${week.endDate}.`);
  }
} finally {
  await prisma.$disconnect();
}

function sumByGroup(movements) {
  const totals = new Map();
  for (const movement of movements) totals.set(movement.groupId, (totals.get(movement.groupId) ?? 0) + movement.amountCents);
  return totals;
}

async function loadMovementDetails(movements) {
  if (movements.length === 0) return [];

  const checkIds = movements.map((movement) => movement.relatedCheckId).filter(Boolean);
  const ticketIds = movements.map((movement) => movement.relatedTicketId).filter(Boolean);
  const [checks, tickets] = await Promise.all([
    checkIds.length
      ? prisma.ticketCheck.findMany({
          where: { id: { in: checkIds } },
          select: {
            id: true,
            drawDate: true,
            lineResults: true,
            winningNumbers: true,
            winningStars: true,
            ticket: { select: { id: true, draw: { select: { type: true, drawDate: true } } } }
          }
        })
      : [],
    ticketIds.length
      ? prisma.ticket.findMany({
          where: { id: { in: ticketIds } },
          select: { id: true, draw: { select: { type: true, drawDate: true } } }
        })
      : []
  ]);
  const checkById = new Map(checks.map((check) => [check.id, check]));
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));

  return movements.map((movement) => {
    const check = movement.relatedCheckId ? checkById.get(movement.relatedCheckId) : null;
    const ticket = check?.ticket ?? (movement.relatedTicketId ? ticketById.get(movement.relatedTicketId) : null);
    const draw = ticket?.draw;
    return {
      id: movement.id,
      groupId: movement.groupId,
      type: movement.type,
      amountCents: movement.amountCents,
      ticketId: ticket?.id ?? movement.relatedTicketId ?? null,
      lines: Array.isArray(check?.lineResults)
        ? check.lineResults.filter((line) => Number(line?.prizeCents ?? 0) > 0).map((line) => line.lineIndex).filter((line) => line !== undefined && line !== null)
        : [],
      lineResults: Array.isArray(check?.lineResults) ? check.lineResults : [],
      game: draw?.type ?? null,
      drawDate: movement.type === 'PRIZE' && check?.drawDate
        ? check.drawDate.toISOString().slice(0, 10)
        : draw?.drawDate
          ? draw.drawDate.toISOString().slice(0, 10)
          : check?.drawDate ? check.drawDate.toISOString().slice(0, 10) : null,
      winningNumbers: Array.isArray(check?.winningNumbers) ? check.winningNumbers : [],
      winningStars: Array.isArray(check?.winningStars) ? check.winningStars : [],
      occurredAt: movement.occurredAt,
      note: movement.note
    };
  });
}

async function sendMail(report) {
  const recipients = report.group.emailRecipients.map((recipient) => recipient.email);
  const transporter = nodemailer.createTransport({
    host: process.env.RESULTS_SMTP_HOST ?? 'smtp.dondominio.com',
    port: Number(process.env.RESULTS_SMTP_PORT ?? '587'),
    secure: process.env.RESULTS_SMTP_SECURE === 'true',
    requireTLS: true,
    auth: {
      user: process.env.RESULTS_SMTP_USER ?? 'loto@conquense.dev',
      pass: process.env.RESULTS_SMTP_PASSWORD ?? process.env.RESULTS_IMAP_PASSWORD
    }
  });
  await transporter.sendMail({
    from: process.env.RESULTS_REPORT_FROM ?? 'loto@conquense.dev',
    to: recipients,
    subject: `loto-sync — ${report.group.name} — radiografía del bote ${report.week.startDate}`,
    text: buildTextReport(report),
    html: buildHtmlReport(report)
  });
}

function buildTextReport(report) {
  const opening = formatEuro(report.openingBalanceCents);
  const closing = formatEuro(report.closingBalanceCents);
  const change = formatEuro(report.closingBalanceCents - report.openingBalanceCents);
  const summary = report.summary;
  const prizes = report.movements.filter((movement) => movement.type === 'PRIZE');
  const expenses = report.movements.filter((movement) => movement.type === 'TICKET_EXPENSE');
  const otherMovements = report.movements.filter((movement) => !['PRIZE', 'TICKET_EXPENSE'].includes(movement.type));
  return [
    `RADIOGRAFÍA SEMANAL DEL BOTE — ${report.group.name}`,
    `Periodo: ${formatShortDate(report.week.startDate)} a ${formatShortDate(addDays(report.week.endDate, -1))}`,
    '',
    buildNarrative(report),
    '',
    'CUENTAS CLARAS',
    `Bote al inicio: ${opening}`,
    `Entradas registradas: ${formatEuro(summary.inflowsCents)}`,
    `Salidas registradas: ${formatEuro(summary.outflowsCents)}`,
    `Bote al cierre: ${closing}`,
    `Variación neta: ${change}`,
    `Operaciones: ${summary.operations}`,
    '',
    'PREMIOS — POR QUÉ ENTRÓ EL DINERO',
    prizes.length > 0 ? prizes.map(formatPrizeText).join('\n') : 'No se han registrado premios en este periodo.',
    '',
    'GASTOS — EN QUÉ SE USÓ EL DINERO',
    expenses.length > 0 ? expenses.map(formatExpenseText).join('\n') : 'No se han registrado gastos de boletos en este periodo.',
    '',
    'OTROS MOVIMIENTOS',
    otherMovements.length > 0 ? otherMovements.map(formatOtherMovementText).join('\n') : 'No hay aportaciones ni ajustes en este periodo.',
    '',
    'Informe generado automáticamente por loto-sync.'
  ].join('\n');
}

function buildHtmlReport(report) {
  const opening = formatEuro(report.openingBalanceCents);
  const closing = formatEuro(report.closingBalanceCents);
  const changeCents = report.closingBalanceCents - report.openingBalanceCents;
  const change = formatEuro(changeCents);
  const summary = report.summary;
  const prizes = report.movements.filter((movement) => movement.type === 'PRIZE');
  const expenses = report.movements.filter((movement) => movement.type === 'TICKET_EXPENSE');
  const otherMovements = report.movements.filter((movement) => !['PRIZE', 'TICKET_EXPENSE'].includes(movement.type));
  const periodLabel = `${formatDate(report.week.startDate)} al ${formatDate(addDays(report.week.endDate, -1))}`;
  const metric = (label, value, color, background) => `<td style="width:50%;padding:0 6px 12px 0;vertical-align:top;"><div style="padding:16px;border:1px solid ${background};border-radius:14px;background:${background};"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">${label}</div><strong style="display:block;margin-top:5px;font-size:22px;line-height:1.1;color:${color};">${escapeHtml(value)}</strong></div></td>`;
  return `<!doctype html><html lang="es"><body style="margin:0;background:#e9eef3;color:#15202b;font-family:Arial,sans-serif;line-height:1.5;"><div style="max-width:700px;margin:0 auto;padding:22px 12px;"><header style="padding:28px 24px;border-radius:18px 18px 0 0;background:#132c3f;color:#ffffff;"><p style="margin:0 0 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#f5b544;">Loto-sync / radiografía semanal</p><h1 style="margin:0;font-size:30px;line-height:1.1;">${escapeHtml(report.group.name)}</h1><p style="margin:10px 0 0;color:#c7d5df;font-size:14px;">${escapeHtml(periodLabel)} · 8 días de historia</p></header><main style="padding:22px 20px;background:#ffffff;"><div style="padding:16px 18px;margin-bottom:20px;border-left:4px solid #f5b544;background:#fff8e8;color:#344452;font-size:15px;">${escapeHtml(buildNarrative(report))}</div><table role="presentation" style="width:100%;border-collapse:collapse;"><tr>${metric('Bote inicial', opening, '#244c68', '#eef5f8')}${metric('Bote final', closing, changeCents >= 0 ? '#166534' : '#b91c1c', changeCents >= 0 ? '#edf9f0' : '#fff1f1')}</tr><tr>${metric('Entradas', formatEuro(summary.inflowsCents), '#166534', '#f0f8f2')}${metric('Salidas', formatEuro(summary.outflowsCents), '#9a3412', '#fff4ec')}</tr></table><section style="margin-top:14px;padding-top:18px;border-top:1px solid #dce4ea;"><h2 style="margin:0 0 10px;font-size:18px;color:#132c3f;">El balance, sin letra pequeña</h2><p style="margin:0;color:#526370;font-size:14px;">${escapeHtml(`Hubo ${summary.operations} operaciones. El bote ${changeCents >= 0 ? 'creció' : 'bajó'} ${escapeHtml(change)} durante el periodo. ${buildCoverageSentence(summary)}`)}</p></section>${buildHtmlMovementSection('Premios · por qué entró el dinero', prizes, formatPrizeHtml, '#edf9f0', '#166534', 'No se han registrado premios en este periodo.')}${buildHtmlMovementSection('Gastos · en qué se usó el dinero', expenses, formatExpenseHtml, '#fff4ec', '#9a3412', 'No se han registrado gastos de boletos en este periodo.')}${buildHtmlMovementSection('Otros movimientos', otherMovements, formatOtherMovementHtml, '#f4f6f8', '#526370', 'No hay aportaciones ni ajustes en este periodo.')}<div style="margin-top:22px;padding:16px;border-radius:14px;background:#132c3f;color:#ffffff;"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#f5b544;">Conclusión</div><p style="margin:6px 0 0;font-size:16px;line-height:1.45;">${escapeHtml(buildClosingSentence(report))}</p></div><p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;color:#71808c;font-size:12px;">Informe generado automáticamente por <a href="https://conquense.dev" style="color:#1d4ed8;font-weight:700;">conquense.dev</a>. Consulta tus grupos y boletos en <a href="https://loterias.conquense.dev/" style="color:#1d4ed8;font-weight:700;">loterias.conquense.dev</a>.</p></main></div></body></html>`;
}

function buildNarrative(report) {
  const summary = report.summary;
  const change = report.closingBalanceCents - report.openingBalanceCents;
  return `El bote pasó de ${formatEuro(report.openingBalanceCents)} a ${formatEuro(report.closingBalanceCents)} (${formatSignedEuro(change)}). ${buildCoverageSentence(summary)}`;
}

function buildCoverageSentence(summary) {
  const parts = [];
  if (summary.expensesCents > 0) parts.push(`se pagaron ${formatEuro(summary.expensesCents)} en boletos`);
  if (summary.prizesCents > 0 && summary.expensesCents > 0) parts.push(`los premios cubrieron el ${Math.round((summary.prizesCents / summary.expensesCents) * 100)}% de ese gasto`);
  else if (summary.prizesCents > 0) parts.push(`entraron ${formatEuro(summary.prizesCents)} en premios`);
  if (summary.contributionsCents > 0) parts.push(`hubo ${formatEuro(summary.contributionsCents)} de aportaciones`);
  return parts.length > 0 ? `${parts.join('; ')}.` : 'No hubo movimientos económicos registrados.';
}

function formatPrizeText(prize) {
  return [
    `- ${movementTitle(prize)}: ${formatEuro(prize.amountCents)}`,
    `  Por qué: ${prizeExplanation(prize)}`,
    prize.ticketId ? `  Boleto: ${prize.ticketId}` : null,
    prize.note ? `  Registro: ${prize.note}` : null
  ].filter(Boolean).join('\n');
}

function formatExpenseText(expense) {
  return [
    `- ${movementTitle(expense)}: ${formatEuro(Math.abs(expense.amountCents))}`,
    `  Por qué: ${expenseExplanation(expense)}`,
    expense.ticketId ? `  Boleto: ${expense.ticketId}` : null,
    expense.note ? `  Registro: ${expense.note}` : null
  ].filter(Boolean).join('\n');
}

function formatOtherMovementText(movement) {
  const label = movement.type === 'CONTRIBUTION' ? 'Aportación' : movement.type === 'ADJUSTMENT' ? 'Ajuste' : movement.type === 'OPENING' ? 'Apertura' : movement.type;
  return `- ${label} · ${formatMovementDate(movement.occurredAt)}: ${formatSignedEuro(movement.amountCents)}${movement.note ? ` — ${movement.note}` : ' — concepto no indicado'}`;
}

function movementTitle(movement) {
  const game = movement.game === 'EUROMILLONES' ? 'Euromillones' : movement.game === 'PRIMITIVA' ? 'La Primitiva' : 'Sorteo no identificado';
  return `${game}${movement.drawDate ? ` · ${formatShortDate(movement.drawDate)}` : ''}`;
}

function prizeExplanation(prize) {
  const winningLines = prize.lineResults.filter((line) => Number(line?.prizeCents ?? 0) > 0);
  if (winningLines.length === 0) return 'premio registrado por el comprobador, pero no hay detalle de línea disponible.';
  return winningLines.map((line) => {
    const facts = [];
    if (line.category) facts.push(String(line.category).toLowerCase());
    else if (Number.isInteger(line.matchesMain)) facts.push(`${line.matchesMain} aciertos`);
    if (Number.isInteger(line.matchesExtra) && line.matchesExtra > 0) facts.push(`${line.matchesExtra} estrellas`);
    if (line.elMillionMatch) facts.push('acierto en El Millón');
    if (line.reintegroMatch && !facts.some((fact) => fact.includes('reintegro'))) facts.push('reintegro');
    const matched = Array.isArray(line.matchedNumbers) && line.matchedNumbers.length > 0 ? ` (${line.matchedNumbers.join(', ')})` : '';
    return `línea ${line.lineIndex}: ${facts.join(' + ') || 'importe premiado'}${matched}`;
  }).join('; ') + '.';
}

function expenseExplanation(expense) {
  if (expense.game && expense.drawDate) return `compra del boleto de ${expense.game === 'EUROMILLONES' ? 'Euromillones' : 'La Primitiva'} para el sorteo del ${formatDate(expense.drawDate)}.`;
  return expense.note ? expense.note : 'gasto de boleto; el registro no conserva más detalle.';
}

function formatSignedEuro(amountCents) {
  return `${amountCents >= 0 ? '+' : ''}${formatEuro(amountCents)}`;
}

function formatMovementDate(value) {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(value));
}

function buildHtmlMovementSection(title, movements, formatter, background, accent, empty) {
  const content = movements.length > 0 ? movements.map(formatter).join('') : `<p style="margin:0;color:#71808c;font-size:14px;">${empty}</p>`;
  return `<section style="margin-top:22px;padding:18px;border-radius:14px;background:${background};"><h2 style="margin:0 0 12px;font-size:18px;color:${accent};">${title}</h2>${content}</section>`;
}

function formatPrizeHtml(prize) {
  return `<article style="padding:12px 0;border-top:1px solid #cfe5d3;"><div style="display:flex;justify-content:space-between;gap:14px;"><strong style="color:#163b25;">${escapeHtml(movementTitle(prize))}</strong><strong style="color:#166534;white-space:nowrap;">${escapeHtml(formatEuro(prize.amountCents))}</strong></div><p style="margin:5px 0 0;color:#405548;font-size:13px;"><strong>Por qué:</strong> ${escapeHtml(prizeExplanation(prize))}</p>${movementMetaHtml(prize)}</article>`;
}

function formatExpenseHtml(expense) {
  return `<article style="padding:12px 0;border-top:1px solid #f1d9c8;"><div style="display:flex;justify-content:space-between;gap:14px;"><strong style="color:#5b2c18;">${escapeHtml(movementTitle(expense))}</strong><strong style="color:#9a3412;white-space:nowrap;">${escapeHtml(formatEuro(Math.abs(expense.amountCents)))}</strong></div><p style="margin:5px 0 0;color:#6b5144;font-size:13px;"><strong>Por qué:</strong> ${escapeHtml(expenseExplanation(expense))}</p>${movementMetaHtml(expense)}</article>`;
}

function formatOtherMovementHtml(movement) {
  const label = movement.type === 'CONTRIBUTION' ? 'Aportación' : movement.type === 'ADJUSTMENT' ? 'Ajuste' : movement.type === 'OPENING' ? 'Apertura' : movement.type;
  return `<article style="padding:12px 0;border-top:1px solid #dce4ea;"><div style="display:flex;justify-content:space-between;gap:14px;"><strong>${escapeHtml(label)} · ${escapeHtml(formatMovementDate(movement.occurredAt))}</strong><strong style="white-space:nowrap;">${escapeHtml(formatSignedEuro(movement.amountCents))}</strong></div><p style="margin:5px 0 0;color:#526370;font-size:13px;">${escapeHtml(movement.note || 'Concepto no indicado.')}</p></article>`;
}

function movementMetaHtml(movement) {
  const meta = [movement.ticketId ? `Boleto ${movement.ticketId}` : null, movement.lines.length > 0 ? `Línea(s) ${movement.lines.join(', ')}` : null, movement.note ? movement.note : null].filter(Boolean).join(' · ');
  return meta ? `<p style="margin:6px 0 0;color:#71808c;font-size:12px;">${escapeHtml(meta)}</p>` : '';
}

function buildClosingSentence(report) {
  const summary = report.summary;
  const change = report.closingBalanceCents - report.openingBalanceCents;
  if (summary.prizesCents > 0 && summary.expensesCents > 0) {
    return `${change >= 0 ? 'El bote sale reforzado' : 'El bote sigue necesitando apoyo'}: los premios aportaron ${formatEuro(summary.prizesCents)} frente a ${formatEuro(summary.expensesCents)} gastados en boletos.`;
  }
  if (summary.expensesCents > 0) return `La semana deja ${formatEuro(summary.expensesCents)} invertidos en boletos y un bote ${change >= 0 ? 'al alza' : 'a la baja'} de ${formatEuro(report.closingBalanceCents)}.`;
  if (summary.contributionsCents > 0) return `Las aportaciones fueron el motor de la semana: ${formatEuro(summary.contributionsCents)} registrados y un bote final de ${formatEuro(report.closingBalanceCents)}.`;
  return `El periodo termina con un bote de ${formatEuro(report.closingBalanceCents)} y ${summary.operations} operaciones registradas.`;
}

function formatEuro(amountCents) {
  return (amountCents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--reference-date') options.referenceDate = argv[++index];
    else if (argument === '--help') {
      console.log('Uso: npm run weekly-balance:send -- [--dry-run] [--reference-date YYYY-MM-DD]');
      process.exit(0);
    } else throw new Error(`Argumento no reconocido: ${argument}`);
  }
  if (options.referenceDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.referenceDate)) throw new Error('--reference-date debe usar el formato YYYY-MM-DD.');
  return options;
}

function readState() {
  if (!existsSync(statePath)) return { sentWeeks: {} };
  const value = JSON.parse(readFileSync(statePath, 'utf8'));
  return value && typeof value === 'object' && value.sentWeeks && typeof value.sentWeeks === 'object'
    ? value
    : { sentWeeks: {} };
}

function writeState(value) {
  mkdirSync(stateDir, { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, statePath);
}

function loadLocalEnvFiles(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    const equalIndex = trimmed.indexOf('=');
    if (!trimmed || trimmed.startsWith('#') || equalIndex <= 0) continue;
    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();
    if (process.env[key] !== undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
