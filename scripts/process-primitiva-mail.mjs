import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadResultFilters, matchResultFilter, validateExtraction } from './results-parser.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(process.cwd());
const workerDir = resolve(root, 'var/primitiva-worker');
const messageDir = resolve(workerDir, 'messages');
const resultDir = resolve(workerDir, 'results');
const statePath = resolve(workerDir, 'state.json');
const localEmlPath = process.argv[2] === '--file' ? resolve(root, process.argv[3] ?? '') : null;

loadLocalEnvFiles(resolve(root, '.env.local'));
loadLocalEnvFiles(resolve(root, '.env'));

const resultFilters = loadResultFilters(process.env);

const required = [
  'DATABASE_URL',
  'DB_SYNC_TOKEN',
  'REMOTE_SYNC_BASE_URL',
  ...(localEmlPath ? [] : ['RESULTS_IMAP_PASSWORD']),
];
if (!process.env.RESULTS_SMTP_PASSWORD && !process.env.RESULTS_IMAP_PASSWORD) {
  required.push('RESULTS_SMTP_PASSWORD or RESULTS_IMAP_PASSWORD');
}
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Faltan variables de configuración: ${missing.join(', ')}`);
}

mkdirSync(messageDir, { recursive: true });
mkdirSync(resultDir, { recursive: true });

const state = readState();
const client = localEmlPath ? null : new ImapFlow({
  host: process.env.RESULTS_IMAP_HOST ?? 'imap.dondominio.com',
  port: Number(process.env.RESULTS_IMAP_PORT ?? '993'),
  secure: process.env.RESULTS_IMAP_SECURE !== 'false',
  auth: {
    user: process.env.RESULTS_IMAP_USER ?? 'loto@conquense.dev',
    pass: process.env.RESULTS_IMAP_PASSWORD
  },
  logger: false
});

const prisma = createPrismaClient();
let processed = 0;

try {
  if (localEmlPath) {
    if (!existsSync(localEmlPath)) throw new Error(`No existe el EML: ${localEmlPath}`);
    const source = readFileSync(localEmlPath);
    const parsed = await simpleParser(source);
    await processMessage({ source, parsed, uid: null });
  } else {
    await client.connect();
    const mailbox = process.env.RESULTS_IMAP_MAILBOX ?? 'INBOX';
    const lock = await client.getMailboxLock(mailbox);
    try {
      // No dependemos de que el mensaje siga sin leer: abrirlo en otro cliente
      // puede marcarlo como visto antes de que el worker llegue a procesarlo.
      // state.processed evita duplicar importaciones e informes ya enviados.
      const uids = await client.search({ all: true }, { uid: true });
      for (const uid of uids.sort((left, right) => left - right)) {
        const message = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
        if (!message?.source) continue;
        const parsed = await simpleParser(message.source);
        await processMessage({ source: message.source, parsed, uid });
      }
    } finally {
      lock.release();
    }
  }
} finally {
  await pruneRetention().catch((error) => console.error(`No se pudo aplicar la retención: ${error.message}`));
  if (client) await client.logout().catch(() => undefined);
  await prisma.$disconnect();
}

console.log(`Results worker: ${processed} correo(s) procesado(s).`);

async function processMessage({ source, parsed, uid }) {
  const messageId = parsed.messageId?.trim() || `content-${createHash('sha256').update(source).digest('hex')}`;
  if (state.processed[messageId]?.sentAt) return;
  const matchedFilter = matchResultFilter(parsed, resultFilters);
  if (!matchedFilter) return;
  const game = matchedFilter.game;

  const safeId = createHash('sha256').update(messageId).digest('hex').slice(0, 24);
  const emlPath = resolve(messageDir, `${safeId}.eml`);
  if (!existsSync(emlPath)) writeFileSync(emlPath, source);

  const extraction = await extractWithCodex(emlPath, game);
  const result = validateExtraction(extraction, game);
  const resultPath = resolve(resultDir, `${result.date}-${safeId}.json`);
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  const resultHash = createHash('sha256').update(JSON.stringify(result)).digest('hex');
  const stateEntry = {
    ...(state.processed[messageId] ?? {}),
    messageId,
    uid,
    drawDate: result.date,
    game: result.game,
    filterId: matchedFilter.id,
    resultHash,
    emlPath,
    resultPath,
    sentGroups: state.processed[messageId]?.sentGroups ?? {}
  };

  await runBackup('PRE');
  const report = await importAndBuildReport(result);
  await runBackup('POST');
  await sendGroupReports(result, report, resultHash, stateEntry);

  stateEntry.sentAt = new Date().toISOString();
  state.processed[messageId] = stateEntry;
  writeState(state);
  if (uid !== null) await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
  processed += 1;
}

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL debe apuntar a PostgreSQL remoto.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

function loadLocalEnvFiles(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex <= 0) continue;
    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();
    if (process.env[key] !== undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function readState() {
  if (!existsSync(statePath)) return { processed: {} };
  try {
    const value = JSON.parse(readFileSync(statePath, 'utf8'));
    return value && typeof value === 'object' && value.processed && typeof value.processed === 'object'
      ? value
      : { processed: {} };
  } catch {
    throw new Error(`No se pudo leer ${statePath}.`);
  }
}

function writeState(value) {
  const temporaryPath = `${statePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, statePath);
}

async function pruneRetention() {
  const retentionDays = Math.max(1, Number(process.env.RESULTS_RETENTION_DAYS ?? '90'));
  const fileCutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const directory of [messageDir, resultDir]) {
    for (const name of await readdir(directory)) {
      const filePath = resolve(directory, name);
      const details = await stat(filePath).catch(() => null);
      if (details?.isFile() && details.mtimeMs < fileCutoff) await unlink(filePath);
    }
  }

  const stateCutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  let changed = false;
  for (const [messageId, entry] of Object.entries(state.processed)) {
    if (!entry.sentAt || new Date(entry.sentAt).getTime() >= stateCutoff) continue;
    for (const filePath of [entry.emlPath, entry.resultPath]) {
      if (filePath && isWithinWorkerDirectory(filePath)) await unlink(filePath).catch(() => undefined);
    }
    delete state.processed[messageId];
    changed = true;
  }
  if (changed) writeState(state);
}

function isWithinWorkerDirectory(filePath) {
  const normalized = resolve(filePath);
  return normalized.startsWith(`${workerDir}/`);
}

async function extractWithCodex(emlPath, game) {
  const codex = process.env.RESULTS_CODEX_BIN ?? '/home/rafa/.local/bin/codex';
  const prompt = [
    `Lee únicamente el correo EML indicado y extrae el resultado del sorteo de ${game === 'EUROMILLONES' ? 'Euromillón' : 'La Primitiva'}.`,
    `Fichero: ${emlPath}`,
    game === 'EUROMILLONES'
      ? 'Devuelve exclusivamente JSON: {"date":"YYYY-MM-DD","numbers":[1,2,3,4,5],"stars":[1,2],"elMillionCode":"ABC12345"}. numbers son los cinco números y stars las dos estrellas.'
      : 'Devuelve exclusivamente JSON: {"date":"YYYY-MM-DD","numbers":[1,2,3,4,5,6],"complementario":0,"reintegro":0}.',
    'date es la fecha real del sorteo. No inventes valores.',
    'Si no puedes determinar con seguridad todos los campos, devuelve exactamente {"error":"resultado no determinable"}.'
  ].join('\n');

  return new Promise((resolveOutput, reject) => {
    const child = spawn(codex, ['exec', '-s', 'read-only', '-C', root, '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Codex superó el tiempo máximo de 5 minutos.'));
    }, 300_000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error((stderr || `Codex terminó con código ${code}`).trim()));
      try {
        const cleaned = stdout.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        resolveOutput(JSON.parse(cleaned));
      } catch {
        reject(new Error('Codex no devolvió JSON válido.'));
      }
    });
    child.stdin.end(prompt);
  });
}

async function runBackup(label) {
  await execFileAsync('npm', ['run', 'backup:db'], { cwd: root, env: process.env, maxBuffer: 2_000_000 });
  console.log(`Backup ${label} correcto.`);
}

async function importAndBuildReport(result) {
  const drawDate = new Date(`${result.date}T00:00:00.000Z`);
  const tickets = await prisma.ticket.findMany({
    where: {
      draw: { type: result.game },
      purchaseStatus: 'CONFIRMED',
      OR: [{ checks: { some: { drawDate } } }, { draw: { drawDate } }]
    },
    include: {
      draw: true,
      group: {
        include: {
          emailRecipients: {
            where: { enabled: true },
            orderBy: { email: 'asc' }
          }
        }
      },
      lines: { include: { numbers: true }, orderBy: { lineIndex: 'asc' } },
      checks: { where: { drawDate }, select: { prizeCents: true, elMillionMatch: true } }
    }
  });
  const groupIds = [...new Set(tickets.map((ticket) => ticket.groupId))];
  const balances = groupIds.length
    ? await prisma.groupMovement.groupBy({
        by: ['groupId'],
        where: { groupId: { in: groupIds } },
        _sum: { amountCents: true }
      })
    : [];
  const balanceByGroup = new Map(balances.map((item) => [item.groupId, item._sum.amountCents ?? 0]));

  const reportRows = [];
  await prisma.$transaction(async (tx) => {
    await tx.draw.update({ where: { type_drawDate: { type: result.game, drawDate } }, data: { elMillionCode: result.elMillionCode } }).catch(() => undefined);
    await tx.resultCache.upsert({
      where: { game_drawDate: { game: result.game, drawDate } },
      update: { payload: buildPayload(result), fetchedAt: new Date() },
      create: { game: result.game, drawDate, payload: buildPayload(result), fetchedAt: new Date() }
    });

    for (const ticket of tickets) {
      const lines = ticket.lines.length > 0 ? ticket.lines : [{ numbers: [] }];
      const lineReports = lines.map((line) => {
        const main = line.numbers.filter((number) => number.kind === 'MAIN').map((number) => number.value);
        const hits = main.filter((number) => result.numbers.includes(number));
        const stars = line.numbers.filter((number) => number.kind === 'STAR').map((number) => number.value);
        const starHits = stars.filter((number) => result.stars.includes(number));
        return {
          numbers: main,
          hits,
          missed: main.filter((number) => !result.numbers.includes(number)),
          stars,
          starHits,
          missedStars: stars.filter((number) => !result.stars.includes(number)),
          complement: line.complement,
          reintegro: line.reintegro
        };
      });
      const primary = lineReports[0];
      const existing = ticket.checks[0];
      const matchesMain = primary.hits.length;
      const matchesStars = primary.starHits.length;
      const elMillionMatch = result.game === 'EUROMILLONES' && ticket.elMillionCode
        ? ticket.elMillionCode === result.elMillionCode
        : null;
      const checkStatus = existing?.prizeCents > 0 ? 'PREMIO' : 'COMPROBADO';
      await tx.ticketCheck.upsert({
        where: { ticketId_drawDate: { ticketId: ticket.id, drawDate } },
        update: { status: checkStatus, reason: null, winningNumbers: result.numbers, winningStars: result.stars, matchesMain, matchesStars, elMillionMatch, checkedAt: new Date() },
        create: { ticketId: ticket.id, drawDate, status: checkStatus, reason: null, winningNumbers: result.numbers, winningStars: result.stars, matchesMain, matchesStars, elMillionMatch, checkedAt: new Date() }
      });
      const allChecks = await tx.ticketCheck.findMany({ where: { ticketId: ticket.id }, select: { status: true, prizeCents: true } });
      const nextStatus = allChecks.some((check) => check.status === 'PREMIO' || (check.prizeCents ?? 0) > 0) ? 'PREMIO' : 'COMPROBADO';
      await tx.ticket.update({ where: { id: ticket.id }, data: { status: nextStatus } });
      reportRows.push({
        ticketId: ticket.id,
        groupId: ticket.groupId,
        group: ticket.group?.name ?? ticket.groupId,
        recipients: ticket.group?.emailRecipients.map((recipient) => recipient.email) ?? [],
        balanceCents: balanceByGroup.get(ticket.groupId) ?? 0,
        elMillionCode: ticket.elMillionCode,
        elMillionMatch,
        lines: lineReports
      });
    }
  });

  const groups = [...new Map(reportRows.map((row) => [row.groupId, row])).values()].map((firstRow) => ({
    groupId: firstRow.groupId,
    group: firstRow.group,
    balanceCents: firstRow.balanceCents,
    recipients: firstRow.recipients,
    tickets: reportRows.filter((row) => row.groupId === firstRow.groupId)
  }));
  return { result, groups };
}

function buildPayload(result) {
  const isEuro = result.game === 'EUROMILLONES';
  return {
    success: true,
    data: {
      game: { slug: isEuro ? 'euromillones' : 'primitiva', name: isEuro ? 'Euromillones' : 'La Primitiva' },
      drawDate: result.date,
      combination: result.numbers,
      stars: result.stars,
      resultData: { complementario: result.complementario ?? null, reintegro: result.reintegro ?? null, elMillionCode: result.elMillionCode ?? null }
    },
    source: 'email-codex'
  };
}

async function sendGroupReports(result, report, resultHash, stateEntry) {
  for (const group of report.groups) {
    if (group.recipients.length === 0) {
      throw new Error(`El grupo ${group.group} no tiene destinatarios de correo activos.`);
    }
    if (stateEntry.sentGroups[group.groupId]) continue;
    await sendGroupReport(result, group, resultHash);
    stateEntry.sentGroups[group.groupId] = new Date().toISOString();
    state.processed[stateEntry.messageId ?? `pending-${result.date}`] = stateEntry;
    writeState(state);
  }
}

async function sendGroupReport(result, group, resultHash) {
  const from = process.env.RESULTS_REPORT_FROM ?? 'loto@conquense.dev';
  const dateLabel = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${result.date}T00:00:00.000Z`));
  const summaryData = group.tickets.reduce((summary, ticket) => {
    summary.main += ticket.lines.reduce((total, line) => total + line.hits.length, 0);
    summary.stars += ticket.lines.reduce((total, line) => total + line.starHits.length, 0);
    summary.elMillion += ticket.elMillionMatch ? 1 : 0;
    return summary;
  }, { main: 0, stars: 0, elMillion: 0 });
  const summaryParts = [];
  if (summaryData.main > 0) summaryParts.push(`${summaryData.main} acierto${summaryData.main === 1 ? '' : 's'}`);
  if (summaryData.stars > 0) summaryParts.push(`${summaryData.stars} estrella${summaryData.stars === 1 ? '' : 's'}`);
  if (summaryData.elMillion > 0) summaryParts.push('El Millón acertado');
  const summary = summaryParts.join(' · ') || 'Sin aciertos';
  const balance = (group.balanceCents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const text = buildTextReport(result, group, dateLabel, balance, summary);
  const html = buildHtmlReport(result, group, dateLabel, balance, summary);
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
    from,
    to: [from],
    bcc: group.recipients,
    subject: `${result.game === 'EUROMILLONES' ? 'Euromillones' : 'La Primitiva'} — ${group.group} — resultados ${result.date}`,
    text,
    html,
    headers: { 'X-Loto-Result-Key': `${result.game.toLowerCase()}/${result.date}/${group.groupId}/${resultHash}` }
  });
}

function buildTextReport(result, group, dateLabel, balance, summary) {
  const tickets = group.tickets.map((ticket, index) => {
    const lines = ticket.lines.map((line, lineIndex) => [
      `  Línea ${lineIndex + 1}: ${line.numbers.join(', ') || 'sin números'}`,
      `    Aciertos: ${line.hits.join(', ') || 'ninguno'}`,
      `    Fallados: ${line.missed.join(', ') || 'ninguno'}`,
      ...(result.game === 'EUROMILLONES' ? [`    Estrellas: ${line.stars.join(', ') || 'ninguna'}`, `    Aciertos estrellas: ${line.starHits.join(', ') || 'ninguno'}`] : []),
      ...(result.game === 'PRIMITIVA' ? [`    Complementario: ${line.complement ?? 'no indicado'} | Reintegro: ${line.reintegro ?? 'no indicado'}`] : [])
    ].join('\n')).join('\n');
    const elMillion = result.game === 'EUROMILLONES'
      ? `\n  El Millón: ${ticket.elMillionCode ?? 'pendiente'} (${ticket.elMillionMatch === true ? 'acertado' : ticket.elMillionMatch === false ? 'no acertado' : 'sin comprobar'})`
      : '';
    return `Boleto ${index + 1} (${ticket.ticketId}) — grupo: ${ticket.group}${elMillion}\n${lines}`;
  }).join('\n\n');
  return [
    `INFORME DE ${result.game === 'EUROMILLONES' ? 'EUROMILLONES' : 'LA PRIMITIVA'}`,
    `Grupo: ${group.group}`,
    `Sorteo: ${dateLabel}`,
    '',
    `Resultado del grupo: ${summary}`,
    `Bote restante: ${balance}`,
    '',
    `Combinación ganadora: ${result.numbers.join(', ')}`,
    ...(result.game === 'EUROMILLONES' ? [`Estrellas: ${result.stars.join(', ')}`, `Código ganador de El Millón: ${result.elMillionCode}`] : []),
    ...(result.game === 'PRIMITIVA' ? [`Complementario: ${result.complementario ?? 'no indicado'}`, `Reintegro: ${result.reintegro ?? 'no indicado'}`] : []),
    '',
    tickets || 'No hay boletos correspondientes a este sorteo.',
    '',
    'Informe generado automáticamente por conquense.dev (https://conquense.dev). Consulta tus grupos y boletos en loterias.conquense.dev (https://loterias.conquense.dev/), a partir del correo oficial de Loterías del Estado.'
  ].join('\n');
}

function buildHtmlReport(result, group, dateLabel, balance, summary) {
  const hasHits = summary !== 'Sin aciertos';
  const gameLabel = result.game === 'EUROMILLONES' ? 'Euromillones' : 'La Primitiva';
  const ticketSections = group.tickets.map((ticket, ticketIndex) => {
    const lines = ticket.lines.map((line, lineIndex) => {
      const numberPills = line.numbers.map((number) => `<span style="display:inline-block;margin:2px 4px 2px 0;padding:4px 8px;border-radius:999px;background:${line.hits.includes(number) ? '#dcfce7' : '#fee2e2'};color:${line.hits.includes(number) ? '#166534' : '#991b1b'};font-weight:700;">${escapeHtml(number)}</span>`).join('');
      const hits = line.hits.length > 0 ? line.hits.map((number) => `<span style="color:#166534;font-weight:700;">${escapeHtml(number)}</span>`).join(', ') : '<span style="color:#64748b;">ninguno</span>';
      const missed = line.missed.length > 0 ? line.missed.map((number) => `<span style="color:#991b1b;font-weight:700;">${escapeHtml(number)}</span>`).join(', ') : '<span style="color:#64748b;">ninguno</span>';
      const euroDetails = result.game === 'EUROMILLONES'
        ? `<br><span style="color:#7c3aed;font-weight:700;">Estrellas acertadas:</span> ${escapeHtml(line.starHits.join(', ') || 'ninguna')}`
        : '';
      const primitivaDetails = result.game === 'PRIMITIVA'
        ? `<br><span style="color:#475569;">Complementario: ${escapeHtml(line.complement ?? 'no indicado')} · Reintegro: ${escapeHtml(line.reintegro ?? 'no indicado')}</span>`
        : '';
      return `<tr><td style="padding:12px 0;border-top:1px solid #e2e8f0;vertical-align:top;"><strong>Línea ${lineIndex + 1}</strong><div style="margin-top:8px;">${numberPills || '<span style="color:#64748b;">sin números</span>'}</div><div style="margin-top:8px;font-size:14px;"><span style="color:#166534;font-weight:700;">Aciertos:</span> ${hits}<br><span style="color:#991b1b;font-weight:700;">Fallados:</span> ${missed}${euroDetails}${primitivaDetails}</div></td></tr>`;
    }).join('');
    const euroTicket = result.game === 'EUROMILLONES'
      ? `<p style="margin:8px 0;color:#475569;font-size:14px;"><strong>El Millón del boleto:</strong> ${escapeHtml(ticket.elMillionCode ?? 'pendiente')} · ${ticket.elMillionMatch === true ? 'acertado' : ticket.elMillionMatch === false ? 'no acertado' : 'sin comprobar'}</p>`
      : '';
    return `<section style="margin:20px 0;padding:16px 18px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;"><h3 style="margin:0;color:#0f172a;font-size:17px;">Boleto ${ticketIndex + 1}</h3><p style="margin:4px 0 8px;color:#64748b;font-size:12px;">${escapeHtml(ticket.ticketId)}</p>${euroTicket}<table role="presentation" style="width:100%;border-collapse:collapse;">${lines}</table></section>`;
  }).join('');
  const resultNumbers = result.numbers.map((number) => `<span style="display:inline-block;margin:2px 4px 2px 0;padding:5px 9px;border-radius:999px;background:#e0e7ff;color:#3730a3;font-weight:700;">${escapeHtml(number)}</span>`).join('');
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,sans-serif;line-height:1.5;"><div style="max-width:680px;margin:0 auto;padding:24px 14px;"><div style="padding:24px;border-radius:16px 16px 0 0;background:#1e3a8a;color:#ffffff;"><p style="margin:0 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">Informe de ${gameLabel}</p><h1 style="margin:0;font-size:26px;">${escapeHtml(group.group)}</h1><p style="margin:6px 0 0;opacity:.9;">Sorteo del ${escapeHtml(dateLabel)}</p></div><div style="padding:20px;background:#ffffff;"><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;"><div style="flex:1;min-width:200px;padding:16px;border-radius:12px;background:${hasHits ? '#dcfce7' : '#f8fafc'};border:1px solid ${hasHits ? '#86efac' : '#e2e8f0'};"><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Resultado del grupo</div><strong style="display:block;margin-top:4px;font-size:22px;color:${hasHits ? '#166534' : '#334155'};">${escapeHtml(summary)}</strong></div><div style="flex:1;min-width:200px;padding:16px;border-radius:12px;background:#fef3c7;border:1px solid #fcd34d;"><div style="font-size:12px;color:#92400e;text-transform:uppercase;letter-spacing:.5px;">Bote restante</div><strong style="display:block;margin-top:4px;font-size:22px;color:#92400e;">${escapeHtml(balance)}</strong><span style="font-size:12px;color:#92400e;">Saldo actual del grupo</span></div></div><div style="padding:16px;border-radius:12px;background:#eef2ff;"><h2 style="margin:0 0 8px;font-size:16px;color:#3730a3;">Resultado del sorteo</h2><div>${resultNumbers}</div><p style="margin:10px 0 0;font-size:14px;color:#475569;"><strong>Estrellas:</strong> ${escapeHtml(result.stars.join(', ') || 'no indicadas')}${result.game === 'EUROMILLONES' ? ` · <strong>El Millón:</strong> ${escapeHtml(result.elMillionCode ?? 'no indicado')}` : ` · <strong>Complementario:</strong> ${escapeHtml(result.complementario ?? 'no indicado')} · <strong>Reintegro:</strong> ${escapeHtml(result.reintegro ?? 'no indicado')}`}</p></div>${ticketSections || '<p style="color:#64748b;">No hay boletos correspondientes a este sorteo.</p>'}<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">Informe generado automáticamente por <a href="https://conquense.dev" style="color:#1d4ed8;font-weight:700;">conquense.dev</a>. Consulta tus grupos y boletos en <a href="https://loterias.conquense.dev/" style="color:#1d4ed8;font-weight:700;">loterias.conquense.dev</a>, a partir del correo oficial de Loterías del Estado.</p></div></div></body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}
