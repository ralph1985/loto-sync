import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadResultFilters, matchResultFilter, validateExtraction } from './results-parser.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(process.cwd());
const workerDir = resolve(root, 'var/results-worker');
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
      // state.processed evita duplicar importaciones ya completadas.
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
  await importResult(result);
  await runBackup('POST');

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

async function importResult(result) {
  const drawDate = new Date(`${result.date}T00:00:00.000Z`);
  const tickets = await prisma.ticket.findMany({
    where: {
      draw: { type: result.game },
      purchaseStatus: 'CONFIRMED',
      OR: [{ checks: { some: { drawDate } } }, { draw: { drawDate } }]
    },
    include: {
      lines: { include: { numbers: true }, orderBy: { lineIndex: 'asc' } },
      checks: { where: { drawDate }, select: { prizeCents: true } }
    }
  });

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
          lineIndex: line.lineIndex ?? 1,
          numbers: main,
          hits,
          missed: main.filter((number) => !result.numbers.includes(number)),
          stars,
          starHits,
          missedStars: stars.filter((number) => !result.stars.includes(number)),
          complement: line.complement,
          reintegro: line.reintegro,
          reintegroHit: result.game === 'PRIMITIVA' &&
            line.reintegro !== null && line.reintegro !== undefined &&
            result.reintegro !== null && result.reintegro !== undefined &&
            line.reintegro === result.reintegro,
          elMillionCode: line.elMillionCode ?? null,
          elMillionMatch: result.game === 'EUROMILLONES' && line.elMillionCode && result.elMillionCode
            ? line.elMillionCode === result.elMillionCode
            : null
        };
      });
      const primary = lineReports[0];
      const existing = ticket.checks[0];
      const matchesMain = primary.hits.length;
      const matchesStars = primary.starHits.length;
      const checkStatus = existing?.prizeCents > 0 ? 'PREMIO' : 'COMPROBADO';
      const lineResults = lineReports.map(({ lineIndex, hits: lineHits, starHits, elMillionMatch: lineMillion, reintegroHit }) => ({
        lineIndex,
        matchesMain: lineHits.length,
        matchesStars: starHits.length,
        reintegroMatch: reintegroHit,
        elMillionMatch: lineMillion
      }));
      await tx.ticketCheck.upsert({
        where: { ticketId_drawDate: { ticketId: ticket.id, drawDate } },
        update: { status: checkStatus, reason: null, winningNumbers: result.numbers, winningStars: result.stars, matchesMain, matchesStars, elMillionMatch, lineResults, checkedAt: new Date() },
        create: { ticketId: ticket.id, drawDate, status: checkStatus, reason: null, winningNumbers: result.numbers, winningStars: result.stars, matchesMain, matchesStars, elMillionMatch, lineResults, checkedAt: new Date() }
      });
      const allChecks = await tx.ticketCheck.findMany({ where: { ticketId: ticket.id }, select: { status: true, prizeCents: true } });
      const nextStatus = allChecks.some((check) => check.status === 'PREMIO' || (check.prizeCents ?? 0) > 0) ? 'PREMIO' : 'COMPROBADO';
      await tx.ticket.update({ where: { id: ticket.id }, data: { status: nextStatus } });
    }
  });
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
