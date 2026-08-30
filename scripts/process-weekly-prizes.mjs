import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  buildResultPayload,
  calculateLinePrize,
  calculatePrimitivaLinePrize,
  dateKeyToUtc,
  normalizeApiResult,
  normalizeVerification,
  previousWeekDrawDates,
  scheduledDrawDate,
  sumLinePrizes
} from './weekly-prizes-lib.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(process.cwd());
const stateDir = resolve(root, 'var/weekly-prizes');
const statePath = resolve(stateDir, 'state.json');
const apiBaseUrl = 'https://api.loteriasapi.com/api/v1';
const args = parseArgs(process.argv.slice(2));
const readOnlyMode = args.readOnly === true;

loadLocalEnvFiles(resolve(root, '.env.local'));
loadLocalEnvFiles(resolve(root, '.env'));

const required = ['DATABASE_URL', 'LOTERIAS_API_KEY'];
if (!readOnlyMode) required.push('DB_SYNC_TOKEN', 'REMOTE_SYNC_BASE_URL');
if (!readOnlyMode && !process.env.RESULTS_SMTP_PASSWORD && !process.env.RESULTS_IMAP_PASSWORD) {
  required.push('RESULTS_SMTP_PASSWORD or RESULTS_IMAP_PASSWORD');
}
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) throw new Error(`Faltan variables de configuración: ${missing.join(', ')}`);
if (process.env.DATABASE_URL.startsWith('file:')) throw new Error('DATABASE_URL debe apuntar a PostgreSQL remoto.');

if (readOnlyMode && (!args.game || !args.drawDate || (!args.groupId && !args.groupName))) {
  throw new Error('El modo --read-only requiere --game, --draw-date y --group-id o --group-name.');
}
if (args.scheduled && !args.game) {
  throw new Error('El modo --scheduled requiere --game.');
}
if (args.scheduled && args.drawDate) {
  throw new Error('--scheduled y --draw-date no pueden utilizarse juntos.');
}
if (args.drawDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.drawDate)) {
  throw new Error('--draw-date debe usar el formato YYYY-MM-DD.');
}

if (!readOnlyMode) mkdirSync(stateDir, { recursive: true });
const state = readOnlyMode ? { runs: {} } : readState();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const draws = selectDraws(args);

try {
  const targetGroup = readOnlyMode ? await resolveTargetGroup() : null;
  const reports = [];
  for (const draw of draws) reports.push(await prepareDrawReport(draw, targetGroup));

  if (readOnlyMode) {
    for (const report of reports) await printReadOnlyReport(report);
  } else {
    const pendingReports = reports.filter((report) => !state.runs[report.key]?.databaseCompletedAt);
    if (pendingReports.length > 0) {
      await runBackup('PRE');
      await prisma.$transaction(async (tx) => {
        for (const report of pendingReports) await persistDrawReport(tx, report);
      });
      await runBackup('POST');
      for (const report of pendingReports) {
        state.runs[report.key] = {
          databaseCompletedAt: new Date().toISOString(),
          sentGroups: state.runs[report.key]?.sentGroups ?? {}
        };
      }
      writeState(state);
    }

    for (const report of reports) await sendGroupReports(report);
    console.log(`Weekly prizes: ${draws.length} sorteos procesados.`);
  }
} catch (error) {
  if (!readOnlyMode) await sendOperationalAlert(error);
  throw error;
} finally {
  await prisma.$disconnect();
}

async function prepareDrawReport(draw, targetGroup = null) {
  const resultPayload = await apiRequest(`/results/${draw.game === 'PRIMITIVA' ? 'primitiva' : 'euromillones'}/date/${draw.date}`);
  const result = normalizeApiResult(resultPayload, draw.game, draw.date);
  const drawDate = dateKeyToUtc(draw.date);
  const tickets = await prisma.ticket.findMany({
    where: {
      draw: { type: draw.game },
      purchaseStatus: 'CONFIRMED',
      ...(targetGroup ? { groupId: targetGroup.id } : {}),
      OR: [{ checks: { some: { drawDate } } }, { draw: { drawDate } }]
    },
    include: {
      group: { include: { emailRecipients: { where: { enabled: true }, orderBy: { email: 'asc' } } } },
      lines: { include: { numbers: true }, orderBy: { lineIndex: 'asc' } },
      checks: { where: { drawDate } }
    }
  });

  const rows = [];
  for (const ticket of tickets) {
    const lines = [];
    for (const line of ticket.lines) {
      const numbers = line.numbers.filter((item) => item.kind === 'MAIN').map((item) => item.value);
      const verification = draw.game === 'EUROMILLONES'
        ? normalizeVerification(await apiRequest(`/results/euromillones/check?${new URLSearchParams({ numbers: numbers.join(','), extraNumbers: line.numbers.filter((item) => item.kind === 'STAR').map((item) => item.value).join(','), ...(result.drawId ? { drawId: result.drawId } : {}) }).toString()}`))
        : null;
      const primitivaPrize = draw.game === 'PRIMITIVA'
        ? calculatePrimitivaLinePrize({ result, line, numbers })
        : null;
      const prizeCents = draw.game === 'PRIMITIVA' ? primitivaPrize?.prizeCents ?? null : calculateLinePrize({ verification, result, game: draw.game, line });
      if (prizeCents === null) {
        throw new Error(`Importe no determinable para ${draw.game} ${draw.date}, ticket ${ticket.id}, línea ${line.lineIndex}.`);
      }
      lines.push({
        lineId: line.id,
        lineIndex: line.lineIndex,
        numbers,
        prizeCents,
        category: primitivaPrize?.category ?? verification?.category,
        matchesMain: primitivaPrize?.matchesMain ?? verification?.matchesMain,
        matchesExtra: verification?.matchesExtra,
        matchedNumbers: verification?.matchedNumbers ?? numbers.filter((number) => result.numbers.includes(number)),
        matchedExtraNumbers: verification?.matchedExtraNumbers ?? [],
        elMillionMatch: draw.game === 'EUROMILLONES' && Boolean(line.elMillionCode && result.elMillionCode && line.elMillionCode === result.elMillionCode),
        reintegroMatch: primitivaPrize?.reintegroMatch ?? false
      });
    }
    const prizeCents = sumLinePrizes(lines);
    rows.push({
      ticketId: ticket.id,
      groupId: ticket.groupId,
      group: ticket.group,
      existingCheck: ticket.checks[0] ?? null,
      lines,
      prizeCents
    });
  }

  return {
    key: `${draw.game}/${draw.date}`,
    draw,
    result,
    rows,
    groups: targetGroup
      ? [{ ...targetGroup, rows }]
      : [...new Map(rows.map((row) => [row.groupId, row.group])).values()].map((group) => ({
        ...group,
        rows: rows.filter((row) => row.groupId === group.id)
      }))
  };
}

async function resolveTargetGroup() {
  const where = args.groupId ? { id: args.groupId } : { name: args.groupName };
  const groups = await prisma.group.findMany({
    where,
    select: { id: true, name: true, balanceTrackingEnabled: true }
  });
  if (groups.length === 0) throw new Error(`No existe un grupo que coincida con: ${args.groupId ?? args.groupName}.`);
  if (groups.length > 1) throw new Error(`Hay varios grupos con ese nombre; usa --group-id: ${args.groupName}.`);
  return groups[0];
}

async function printReadOnlyReport(report) {
  const group = report.groups[0];
  const balance = group.balanceTrackingEnabled === false
    ? null
    : ((await prisma.groupMovement.aggregate({
      where: { groupId: group.id },
      _sum: { amountCents: true }
    }))._sum.amountCents ?? 0) / 100;
  const total = report.rows.reduce((sum, row) => sum + row.prizeCents, 0) / 100;
  const lines = report.rows.flatMap((row) => row.lines.map((line) => [
    `  Boleto ${row.ticketId}, línea ${line.lineIndex}: ${formatEuro(line.prizeCents / 100)}`,
    line.category ? ` (${line.category})` : ''
  ].join('')));
  console.log([
    `CONSULTA DE PREMIO — ${report.draw.game === 'PRIMITIVA' ? 'LA PRIMITIVA' : 'EUROMILLONES'}`,
    `Grupo: ${group.name}`,
    `Sorteo: ${report.draw.date}`,
    '',
    lines.length > 0 ? lines.join('\n') : '  No hay boletos confirmados para este sorteo.',
    '',
    `Premio total: ${formatEuro(total)}`,
    ...(balance === null ? [] : [`Bote actual: ${formatEuro(balance)}`]),
    '',
    'Modo solo lectura: no se han modificado datos ni enviado correos.'
  ].join('\n'));
}

function formatEuro(value) {
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function selectDraws(options) {
  if (options.scheduled) return [scheduledDrawDate(options.game)];
  if (options.drawDate && options.game) return [{ game: options.game, date: options.drawDate }];
  if (options.drawDate || options.game) throw new Error('--draw-date y --game deben utilizarse juntos.');
  const referenceDate = options.referenceDate ? dateKeyToUtc(options.referenceDate) : new Date();
  return previousWeekDrawDates(referenceDate);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--read-only') options.readOnly = true;
    else if (argument === '--scheduled') options.scheduled = true;
    else if (argument === '--reference-date') options.referenceDate = argv[++index];
    else if (argument === '--draw-date') options.drawDate = argv[++index];
    else if (argument === '--group-id') options.groupId = argv[++index];
    else if (argument === '--group-name') options.groupName = argv[++index];
    else if (argument === '--game') {
      const game = String(argv[++index] ?? '').toUpperCase();
      if (game !== 'PRIMITIVA' && game !== 'EUROMILLONES') throw new Error('--game debe ser PRIMITIVA o EUROMILLONES.');
      options.game = game;
    } else if (argument === '--help') {
      console.log('Uso: npm run weekly-prizes:process -- --read-only --game PRIMITIVA --draw-date YYYY-MM-DD --group-name "Nombre"');
      process.exit(0);
    } else {
      throw new Error(`Argumento no reconocido: ${argument}`);
    }
  }
  return options;
}

async function persistDrawReport(tx, report) {
  const drawDate = dateKeyToUtc(report.draw.date);
  await tx.resultCache.upsert({
    where: { game_drawDate: { game: report.draw.game, drawDate } },
    update: { payload: buildResultPayload(report.result), fetchedAt: new Date() },
    create: { game: report.draw.game, drawDate, payload: buildResultPayload(report.result), fetchedAt: new Date() }
  });

  for (const row of report.rows) {
    const lineResults = row.lines.map((line) => ({
      lineIndex: line.lineIndex,
      matchesMain: line.matchesMain,
      matchesExtra: line.matchesExtra,
      matchedNumbers: line.matchedNumbers,
      matchedExtraNumbers: line.matchedExtraNumbers,
      prizeCents: line.prizeCents,
      category: line.category,
      elMillionMatch: line.elMillionMatch,
      reintegroMatch: line.reintegroMatch
    }));
    const check = await tx.ticketCheck.upsert({
      where: { ticketId_drawDate: { ticketId: row.ticketId, drawDate } },
      update: {
        status: row.prizeCents > 0 ? 'PREMIO' : 'COMPROBADO',
        reason: null,
        winningNumbers: report.result.numbers,
        winningStars: report.result.stars,
        matchesMain: row.lines[0]?.matchesMain ?? 0,
        matchesStars: row.lines[0]?.matchesExtra ?? 0,
        elMillionMatch: row.lines.some((line) => line.elMillionMatch),
        prizeCents: row.prizeCents,
        prizeSource: 'LOTERIASAPI',
        lineResults,
        checkedAt: new Date()
      },
      create: {
        ticketId: row.ticketId,
        drawDate,
        status: row.prizeCents > 0 ? 'PREMIO' : 'COMPROBADO',
        winningNumbers: report.result.numbers,
        winningStars: report.result.stars,
        matchesMain: row.lines[0]?.matchesMain ?? 0,
        matchesStars: row.lines[0]?.matchesExtra ?? 0,
        elMillionMatch: row.lines.some((line) => line.elMillionMatch),
        prizeCents: row.prizeCents,
        prizeSource: 'LOTERIASAPI',
        lineResults,
        checkedAt: new Date()
      }
    });

    if (row.group.balanceTrackingEnabled !== false && row.prizeCents > 0) {
      await tx.groupMovement.upsert({
        where: { relatedCheckId_type: { relatedCheckId: check.id, type: 'PRIZE' } },
        update: { amountCents: row.prizeCents, occurredAt: new Date(), note: `Premio loteriasAPI ${report.draw.game} ${report.draw.date}` },
        create: { groupId: row.groupId, type: 'PRIZE', amountCents: row.prizeCents, occurredAt: new Date(), note: `Premio loteriasAPI ${report.draw.game} ${report.draw.date}`, relatedTicketId: row.ticketId, relatedCheckId: check.id }
      });
    } else if (row.group.balanceTrackingEnabled !== false) {
      await tx.groupMovement.deleteMany({ where: { relatedCheckId: check.id, type: 'PRIZE' } });
    }

    const checks = await tx.ticketCheck.findMany({ where: { ticketId: row.ticketId }, select: { prizeCents: true } });
    await tx.ticket.update({ where: { id: row.ticketId }, data: { status: checks.some((item) => (item.prizeCents ?? 0) > 0) ? 'PREMIO' : 'COMPROBADO' } });
  }
}

async function sendGroupReports(report) {
  const balanceByGroup = new Map((await prisma.groupMovement.groupBy({ by: ['groupId'], where: { groupId: { in: report.groups.map((group) => group.id) } }, _sum: { amountCents: true } })).map((item) => [item.groupId, item._sum.amountCents ?? 0]));
  for (const group of report.groups) {
    const recipients = group.emailRecipients.map((recipient) => recipient.email);
    if (recipients.length === 0) throw new Error(`El grupo ${group.name} no tiene destinatarios activos.`);
    if (state.runs[report.key]?.sentGroups?.[group.id]) continue;
    const total = group.rows.reduce((sum, row) => sum + row.prizeCents, 0);
    const balance = group.balanceTrackingEnabled === false ? null : (balanceByGroup.get(group.id) ?? 0) / 100;
    const text = [
      `INFORME DE PREMIOS — ${report.draw.game === 'PRIMITIVA' ? 'LA PRIMITIVA' : 'EUROMILLONES'}`,
      `Sorteo: ${report.draw.date}`,
      `Grupo: ${group.name}`,
      '',
      ...group.rows.map((row) => `Boleto ${row.ticketId}: ${(row.prizeCents / 100).toFixed(2)} € (${row.lines.map((line) => `línea ${line.lineIndex}: ${(line.prizeCents / 100).toFixed(2)} €`).join(', ')})`),
      '',
      `Premio total del grupo: ${(total / 100).toFixed(2)} €`,
      ...(balance === null ? [] : [`Bote actualizado: ${balance.toFixed(2)} €`])
    ].join('\n');
    const html = buildHtmlPrizeReport(report, group, balance);
    await sendMail(recipients, `${report.draw.game === 'PRIMITIVA' ? 'La Primitiva' : 'Euromillones'} — ${group.name} — premios ${report.draw.date}`, text, html);
    state.runs[report.key].sentGroups = { ...(state.runs[report.key].sentGroups ?? {}), [group.id]: new Date().toISOString() };
    writeState(state);
  }
}

async function sendOperationalAlert(error) {
  const recipients = (process.env.RESULTS_ALERT_RECIPIENTS ?? process.env.RESULTS_SMTP_USER ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (recipients.length === 0) return;
  try {
    await sendMail(recipients, 'loto-sync — cálculo de sorteo pendiente', `El cálculo automático no pudo completarse. La base de datos puede haberse actualizado si el fallo ocurrió después de la escritura; el estado y los backups permiten reanudarlo de forma idempotente.\n\nMotivo: ${error instanceof Error ? error.message : String(error)}\n\nEl worker reintentará ese sorteo en su siguiente ejecución.`);
  } catch (mailError) {
    console.error(`No se pudo enviar el aviso operativo: ${mailError instanceof Error ? mailError.message : String(mailError)}`);
  }
}

function buildHtmlPrizeReport(report, group, balance) {
  const gameLabel = report.draw.game === 'PRIMITIVA' ? 'La Primitiva' : 'Euromillones';
  const dateLabel = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${report.draw.date}T00:00:00.000Z`));
  const total = group.rows.reduce((sum, row) => sum + row.prizeCents, 0) / 100;
  const hasPrize = total > 0;
  const resultNumbers = report.result.numbers.map((number) => `<span style="display:inline-block;margin:2px 4px 2px 0;padding:5px 9px;border-radius:999px;background:#e0e7ff;color:#3730a3;font-weight:700;">${escapeHtml(number)}</span>`).join('');
  const resultDetails = report.draw.game === 'EUROMILLONES'
    ? `<strong>Estrellas:</strong> ${escapeHtml(report.result.stars.join(', ') || 'no indicadas')} · <strong>El Millón:</strong> ${escapeHtml(report.result.elMillionCode ?? 'no indicado')}`
    : `<strong>Complementario:</strong> ${escapeHtml(report.result.complementario ?? 'no indicado')} · <strong>Reintegro:</strong> ${escapeHtml(report.result.reintegro ?? 'no indicado')}`;
  const ticketSections = group.rows.map((row, ticketIndex) => {
    const lines = row.lines.map((line) => {
      const numbers = line.numbers.map((number) => `<span style="display:inline-block;margin:2px 4px 2px 0;padding:4px 8px;border-radius:999px;background:${line.matchedNumbers.includes(number) ? '#dcfce7' : '#f1f5f9'};color:${line.matchedNumbers.includes(number) ? '#166534' : '#475569'};font-weight:700;">${escapeHtml(number)}</span>`).join('');
      const category = line.category ? `<br><span style="color:#166534;font-weight:700;">${escapeHtml(line.category)}</span>` : '';
      const reintegro = report.draw.game === 'PRIMITIVA' ? `<br><span style="color:${line.reintegroMatch ? '#166534' : '#64748b'};">Reintegro: ${line.reintegroMatch ? 'acertado' : 'no acertado'}</span>` : '';
      const euro = report.draw.game === 'EUROMILLONES' && line.elMillionMatch ? '<br><span style="color:#7c3aed;font-weight:700;">El Millón: acertado</span>' : '';
      return `<tr><td style="padding:12px 0;border-top:1px solid #e2e8f0;vertical-align:top;"><strong>Línea ${line.lineIndex}</strong><div style="margin-top:8px;">${numbers || '<span style="color:#64748b;">sin números</span>'}</div><div style="margin-top:8px;font-size:14px;"><span style="color:#166534;font-weight:700;">Premio:</span> ${formatEuro(line.prizeCents / 100)}${category}${reintegro}${euro}</div></td></tr>`;
    }).join('');
    return `<section style="margin:20px 0;padding:16px 18px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;"><h3 style="margin:0;color:#0f172a;font-size:17px;">Boleto ${ticketIndex + 1}</h3><p style="margin:4px 0 8px;color:#64748b;font-size:12px;">${escapeHtml(row.ticketId)}</p><table role="presentation" style="width:100%;border-collapse:collapse;">${lines}</table><p style="margin:12px 0 0;color:#0f172a;font-weight:700;text-align:right;">Total del boleto: ${formatEuro(row.prizeCents / 100)}</p></section>`;
  }).join('');
  const balanceSection = balance === null ? '' : `<div style="flex:1;min-width:200px;padding:16px;border-radius:12px;background:#fef3c7;border:1px solid #fcd34d;"><div style="font-size:12px;color:#92400e;text-transform:uppercase;letter-spacing:.5px;">Bote actualizado</div><strong style="display:block;margin-top:4px;font-size:22px;color:#92400e;">${formatEuro(balance)}</strong></div>`;
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,sans-serif;line-height:1.5;"><div style="max-width:680px;margin:0 auto;padding:24px 14px;"><div style="padding:24px;border-radius:16px 16px 0 0;background:#1e3a8a;color:#ffffff;"><p style="margin:0 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">Informe de premios · ${gameLabel}</p><h1 style="margin:0;font-size:26px;">${escapeHtml(group.name)}</h1><p style="margin:6px 0 0;opacity:.9;">Sorteo del ${escapeHtml(dateLabel)}</p></div><div style="padding:20px;background:#ffffff;"><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;"><div style="flex:1;min-width:200px;padding:16px;border-radius:12px;background:${hasPrize ? '#dcfce7' : '#f8fafc'};border:1px solid ${hasPrize ? '#86efac' : '#e2e8f0'};"><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Premio total del grupo</div><strong style="display:block;margin-top:4px;font-size:22px;color:${hasPrize ? '#166534' : '#334155'};">${formatEuro(total)}</strong></div>${balanceSection}</div><div style="padding:16px;border-radius:12px;background:#eef2ff;"><h2 style="margin:0 0 8px;font-size:16px;color:#3730a3;">Resultado del sorteo</h2><div>${resultNumbers}</div><p style="margin:10px 0 0;font-size:14px;color:#475569;">${resultDetails}</p></div>${ticketSections || '<p style="color:#64748b;">No hay boletos correspondientes a este sorteo.</p>'}<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">Informe generado automáticamente por <a href="https://conquense.dev" style="color:#1d4ed8;font-weight:700;">conquense.dev</a>. Consulta tus grupos y boletos en <a href="https://loterias.conquense.dev/" style="color:#1d4ed8;font-weight:700;">loterias.conquense.dev</a>.</p></div></div></body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

async function sendMail(recipients, subject, text, html = null) {
  const transporter = nodemailer.createTransport({
    host: process.env.RESULTS_SMTP_HOST ?? 'smtp.dondominio.com',
    port: Number(process.env.RESULTS_SMTP_PORT ?? '587'),
    secure: process.env.RESULTS_SMTP_SECURE === 'true',
    requireTLS: true,
    auth: { user: process.env.RESULTS_SMTP_USER ?? 'loto@conquense.dev', pass: process.env.RESULTS_SMTP_PASSWORD ?? process.env.RESULTS_IMAP_PASSWORD }
  });
  await transporter.sendMail({ from: process.env.RESULTS_REPORT_FROM ?? 'loto@conquense.dev', to: recipients, subject, text, ...(html ? { html } : {}) });
}

async function apiRequest(path) {
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: { 'X-API-Key': process.env.LOTERIAS_API_KEY, Accept: 'application/json', 'User-Agent': 'loto-sync/0.1' } });
  if (!response.ok) throw new Error(`loteriasAPI respondió ${response.status} para ${path}.`);
  return response.json();
}

async function runBackup(label) {
  await execFileAsync('npm', ['run', 'backup:db'], { cwd: root, env: process.env, maxBuffer: 2_000_000 });
  console.log(`Backup ${label} correcto.`);
}

function readState() {
  if (!existsSync(statePath)) return { runs: {} };
  const value = JSON.parse(readFileSync(statePath, 'utf8'));
  return value && typeof value === 'object' && value.runs && typeof value.runs === 'object' ? value : { runs: {} };
}

function writeState(value) {
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
