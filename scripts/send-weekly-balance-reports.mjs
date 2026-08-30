import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  formatDate,
  formatShortDate,
  getWeekWindow
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
    const [openingMovements, closingMovements, prizeMovements] = await Promise.all([
    prisma.groupMovement.findMany({
      where: { groupId: { in: groupIds }, occurredAt: { lt: week.start } },
      select: { groupId: true, amountCents: true }
    }),
    prisma.groupMovement.findMany({
      where: { groupId: { in: groupIds }, occurredAt: { lt: week.end } },
      select: { groupId: true, amountCents: true }
    }),
    prisma.groupMovement.findMany({
      where: { groupId: { in: groupIds }, type: 'PRIZE', occurredAt: { gte: week.start, lt: week.end } },
      orderBy: [{ groupId: 'asc' }, { occurredAt: 'asc' }],
      select: {
        id: true,
        groupId: true,
        amountCents: true,
        occurredAt: true,
        note: true,
        relatedTicketId: true,
        relatedCheckId: true
      }
    })
    ]);

    const prizeDetails = await loadPrizeDetails(prizeMovements);
    const openingByGroup = sumByGroup(openingMovements);
    const closingByGroup = sumByGroup(closingMovements);
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
      closingBalanceCents: closingByGroup.get(group.id) ?? 0,
      prizes: prizeDetails.filter((prize) => prize.groupId === group.id)
    };

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

async function loadPrizeDetails(movements) {
  if (movements.length === 0) return [];

  const checkIds = movements.map((movement) => movement.relatedCheckId).filter(Boolean);
  const ticketIds = movements.map((movement) => movement.relatedTicketId).filter(Boolean);
  const [checks, tickets] = await Promise.all([
    checkIds.length
      ? prisma.ticketCheck.findMany({
          where: { id: { in: checkIds } },
          select: { id: true, drawDate: true, lineResults: true, ticket: { select: { id: true, draw: { select: { type: true, drawDate: true } } } } }
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
      groupId: movement.groupId,
      amountCents: movement.amountCents,
      ticketId: ticket?.id ?? movement.relatedTicketId ?? null,
      lines: Array.isArray(check?.lineResults)
        ? check.lineResults.filter((line) => Number(line?.prizeCents ?? 0) > 0).map((line) => line.lineIndex).filter((line) => line !== undefined && line !== null)
        : [],
      game: draw?.type ?? null,
      drawDate: draw?.drawDate ? draw.drawDate.toISOString().slice(0, 10) : null,
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
    subject: `loto-sync — ${report.group.name} — resumen de bote ${report.week.startDate}`,
    text: buildTextReport(report),
    html: buildHtmlReport(report)
  });
}

function buildTextReport(report) {
  const opening = formatEuro(report.openingBalanceCents);
  const closing = formatEuro(report.closingBalanceCents);
  const change = formatEuro(report.closingBalanceCents - report.openingBalanceCents);
  const prizes = report.prizes.length > 0
    ? report.prizes.map((prize) => [
        `- ${prize.game === 'EUROMILLONES' ? 'Euromillones' : prize.game === 'PRIMITIVA' ? 'La Primitiva' : 'Sorteo no identificado'}${prize.drawDate ? ` · ${formatShortDate(prize.drawDate)}` : ''}: ${formatEuro(prize.amountCents)}`,
        prize.ticketId ? `  Boleto: ${prize.ticketId}` : null,
        prize.lines.length > 0 ? `  Línea(s): ${prize.lines.join(', ')}` : null,
        prize.note ? `  Nota: ${prize.note}` : null
      ].filter(Boolean).join('\n')).join('\n')
    : 'No se han registrado premios esta semana.';
  return [
    `RESUMEN SEMANAL DE BOTE — ${report.group.name}`,
    `Semana: ${formatShortDate(report.week.startDate)} a ${formatShortDate(addOneDay(report.week.endDate))}`,
    '',
    `Bote al inicio: ${opening}`,
    `Bote al cierre: ${closing}`,
    `Variación: ${change}`,
    '',
    'Premios de la semana:',
    prizes,
    '',
    'Informe generado automáticamente por loto-sync.'
  ].join('\n');
}

function buildHtmlReport(report) {
  const opening = formatEuro(report.openingBalanceCents);
  const closing = formatEuro(report.closingBalanceCents);
  const changeCents = report.closingBalanceCents - report.openingBalanceCents;
  const change = formatEuro(changeCents);
  const changeColor = changeCents >= 0 ? '#166534' : '#b91c1c';
  const prizeRows = report.prizes.length > 0
    ? report.prizes.map((prize) => `<tr><td style="padding:12px 0;border-top:1px solid #e2e8f0;"><strong>${escapeHtml(prize.game === 'EUROMILLONES' ? 'Euromillones' : prize.game === 'PRIMITIVA' ? 'La Primitiva' : 'Sorteo no identificado')}</strong><br><span style="color:#64748b;font-size:13px;">${escapeHtml(prize.drawDate ? formatDate(prize.drawDate) : 'Fecha no asociada')}${prize.ticketId ? ` · Boleto ${escapeHtml(prize.ticketId)}` : ''}${prize.lines.length > 0 ? ` · Línea(s) ${escapeHtml(prize.lines.join(', '))}` : ''}</span><strong style="float:right;color:#166534;">${escapeHtml(formatEuro(prize.amountCents))}</strong></td></tr>`).join('')
    : '<tr><td style="padding:14px 0;color:#64748b;">No se han registrado premios esta semana.</td></tr>';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,sans-serif;line-height:1.5;"><div style="max-width:680px;margin:0 auto;padding:24px 14px;"><div style="padding:24px;border-radius:16px 16px 0 0;background:#1e3a8a;color:#ffffff;"><p style="margin:0 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">Resumen semanal de bote</p><h1 style="margin:0;font-size:26px;">${escapeHtml(report.group.name)}</h1><p style="margin:6px 0 0;opacity:.9;">Semana del ${escapeHtml(formatDate(report.week.startDate))} al ${escapeHtml(formatDate(addOneDay(report.week.endDate)))}</p></div><div style="padding:20px;background:#ffffff;"><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;"><div style="flex:1;min-width:180px;padding:16px;border-radius:12px;background:#eef2ff;border:1px solid #c7d2fe;"><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Bote inicial</div><strong style="display:block;margin-top:4px;font-size:22px;color:#3730a3;">${escapeHtml(opening)}</strong></div><div style="flex:1;min-width:180px;padding:16px;border-radius:12px;background:#dcfce7;border:1px solid #86efac;"><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Bote final</div><strong style="display:block;margin-top:4px;font-size:22px;color:#166534;">${escapeHtml(closing)}</strong></div><div style="flex:1;min-width:180px;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;"><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Variación semanal</div><strong style="display:block;margin-top:4px;font-size:22px;color:${changeColor};">${escapeHtml(change)}</strong></div></div><div style="padding:16px;border-radius:12px;background:#eef2ff;"><h2 style="margin:0 0 8px;font-size:16px;color:#3730a3;">Premios de la semana</h2><table role="presentation" style="width:100%;border-collapse:collapse;">${prizeRows}</table></div><p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">Informe generado automáticamente por <a href="https://conquense.dev" style="color:#1d4ed8;font-weight:700;">conquense.dev</a>. Consulta tus grupos y boletos en <a href="https://loterias.conquense.dev/" style="color:#1d4ed8;font-weight:700;">loterias.conquense.dev</a>.</p></div></div></body></html>`;
}

function formatEuro(amountCents) {
  return (amountCents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function addOneDay(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
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
