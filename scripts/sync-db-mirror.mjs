import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const TABLES = [
  { name: 'User', dateFields: ['createdAt', 'updatedAt'], jsonColumns: [] },
  { name: 'Group', dateFields: ['createdAt', 'updatedAt'], jsonColumns: [] },
  { name: 'Draw', dateFields: ['drawDate', 'createdAt', 'updatedAt'], jsonColumns: [] },
  { name: 'GroupMember', dateFields: ['createdAt'], jsonColumns: [] },
  { name: 'GroupInvitation', dateFields: ['createdAt', 'updatedAt'], jsonColumns: [] },
  { name: 'Ticket', dateFields: ['createdAt', 'updatedAt'], jsonColumns: [] },
  { name: 'TicketLine', dateFields: ['createdAt'], jsonColumns: [] },
  { name: 'TicketLineNumber', dateFields: ['createdAt'], jsonColumns: [] },
  { name: 'Receipt', dateFields: ['createdAt'], jsonColumns: [] },
  {
    name: 'TicketCheck',
    dateFields: ['drawDate', 'checkedAt', 'createdAt', 'updatedAt'],
    jsonColumns: ['winningNumbers', 'winningStars']
  },
  {
    name: 'GroupMovement',
    dateFields: ['occurredAt', 'createdAt'],
    jsonColumns: []
  },
  {
    name: 'ResultCache',
    dateFields: ['drawDate', 'fetchedAt', 'createdAt', 'updatedAt'],
    jsonColumns: ['payload']
  },
  { name: 'AuditLog', dateFields: ['createdAt'], jsonColumns: ['payload'] }
];

const args = process.argv.slice(2);
const mode = args[0];
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

if (!mode || (mode !== 'up' && mode !== 'down')) {
  console.error('Usage: node scripts/sync-db-mirror.mjs <up|down> [--dry-run] [--force]');
  process.exit(1);
}

const projectRoot = resolve(process.cwd());
loadLocalEnvFiles(resolve(projectRoot, '.env.local'));
loadLocalEnvFiles(resolve(projectRoot, '.env'));

const sqlitePath = resolve(projectRoot, process.env.LOCAL_SQLITE_PATH ?? 'data/dev.db');
const remoteBaseUrl = resolveRemoteBaseUrl();
const syncToken = process.env.DB_SYNC_TOKEN;

if (!syncToken) {
  console.error('Missing DB_SYNC_TOKEN in .env.local/.env');
  process.exit(1);
}
if (!existsSync(sqlitePath)) {
  console.error(`Local SQLite database not found: ${sqlitePath}`);
  process.exit(1);
}

if (mode === 'up') {
  await syncUp();
} else {
  await syncDown();
}

async function syncUp() {
  console.log('Sync direction: local SQLite -> remote API');
  const localData = readLocalDataset();
  const remoteSnapshot = await fetchRemoteExport();

  const sourceSummary = summarizeDataset(localData);
  const targetSummary = summarizeDataset(remoteSnapshot.dataset);
  logSummary(sourceSummary, 'SQLite local');
  logSummary(targetSummary, 'Remoto');
  assertSafeOverwrite(sourceSummary, targetSummary, force);

  if (dryRun) {
    console.log('Dry run completed. No changes applied.');
    return;
  }

  await pushRemoteImport(localData, force);
  console.log('Sync up completed.');
}

async function syncDown() {
  console.log('Sync direction: remote API -> local SQLite');
  const remoteSnapshot = await fetchRemoteExport();
  const localData = readLocalDataset();

  const sourceSummary = summarizeDataset(remoteSnapshot.dataset);
  const targetSummary = summarizeDataset(localData);
  logSummary(sourceSummary, 'Remoto');
  logSummary(targetSummary, 'SQLite local');
  assertSafeOverwrite(sourceSummary, targetSummary, force);

  if (dryRun) {
    console.log('Dry run completed. No changes applied.');
    return;
  }

  writeLocalDataset(remoteSnapshot.dataset);
  console.log('Sync down completed.');
}

function readLocalDataset() {
  const dataset = {};
  for (const table of TABLES) {
    dataset[table.name] = readSqliteRows(sqlitePath, table.name);
  }
  return dataset;
}

function writeLocalDataset(dataset) {
  const sql = buildSqliteReplaceSql(dataset);
  run('sqlite3', [sqlitePath], { input: sql });
}

async function fetchRemoteExport() {
  const url = `${remoteBaseUrl}/api/admin/db-sync/export`;
  const response = await fetch(url, {
    headers: {
      'x-db-sync-token': syncToken
    }
  });

  if (!response.ok) {
    const body = await safeParseJson(response);
    throw new Error(
      `Remote export failed (${response.status}): ${body?.error ?? response.statusText}`
    );
  }

  const payload = await response.json();
  const dataset = payload?.data?.dataset;
  if (!dataset || typeof dataset !== 'object') {
    throw new Error('Remote export returned invalid dataset.');
  }

  return {
    dataset
  };
}

async function pushRemoteImport(dataset, useForce) {
  const url = `${remoteBaseUrl}/api/admin/db-sync/import`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-db-sync-token': syncToken
    },
    body: JSON.stringify({
      dataset,
      force: useForce
    })
  });

  if (!response.ok) {
    const body = await safeParseJson(response);
    throw new Error(
      `Remote import failed (${response.status}): ${body?.error ?? response.statusText}`
    );
  }
}

function resolveRemoteBaseUrl() {
  const raw = process.env.REMOTE_SYNC_BASE_URL ?? process.env.VERCEL_URL;
  if (!raw) {
    console.error('Missing REMOTE_SYNC_BASE_URL in .env.local/.env');
    process.exit(1);
  }
  const normalized = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
  return normalized.replace(/\/+$/, '');
}

function readSqliteRows(dbPath, tableName) {
  const output = run('sqlite3', ['-json', dbPath, `SELECT * FROM "${tableName}" ORDER BY rowid;`]);
  const text = output.trim();
  return text ? JSON.parse(text) : [];
}

function summarizeDataset(dataset) {
  let totalRows = 0;
  let maxTimestamp = null;

  for (const table of TABLES) {
    const rows = dataset[table.name] ?? [];
    totalRows += rows.length;
    for (const row of rows) {
      for (const field of table.dateFields) {
        const value = row[field];
        if (!value) continue;
        const timestamp = new Date(String(value)).getTime();
        if (Number.isNaN(timestamp)) continue;
        if (maxTimestamp === null || timestamp > maxTimestamp) {
          maxTimestamp = timestamp;
        }
      }
    }
  }

  return {
    totalRows,
    maxDate: maxTimestamp === null ? null : new Date(maxTimestamp).toISOString()
  };
}

function logSummary(summary, label) {
  console.log(`${label}: ${summary.totalRows} rows, maxDate=${summary.maxDate ?? 'n/a'}`);
}

function assertSafeOverwrite(sourceSummary, targetSummary, useForce) {
  const targetHasMoreRows = targetSummary.totalRows > sourceSummary.totalRows;
  const targetIsNewer =
    targetSummary.maxDate !== null &&
    sourceSummary.maxDate !== null &&
    targetSummary.maxDate > sourceSummary.maxDate;

  if ((targetHasMoreRows || targetIsNewer) && !useForce) {
    console.error(
      'Safety stop: destination appears newer/richer. Re-run with --force only if overwrite is intended.'
    );
    process.exit(1);
  }
}

function buildSqliteReplaceSql(dataset) {
  const statements = ['PRAGMA foreign_keys = OFF;', 'BEGIN;'];

  for (const table of [...TABLES].reverse()) {
    statements.push(`DELETE FROM "${table.name}";`);
  }

  for (const table of TABLES) {
    const rows = dataset[table.name] ?? [];
    if (rows.length === 0) continue;
    statements.push(buildInsertStatement(table, rows));
  }

  statements.push('COMMIT;', 'PRAGMA foreign_keys = ON;');
  return `${statements.join('\n')}\n`;
}

function buildInsertStatement(table, rows) {
  const columns = Object.keys(rows[0] ?? {});
  const jsonColumns = new Set(table.jsonColumns);
  const columnsSql = columns.map((column) => `"${column}"`).join(', ');
  const valuesSql = rows
    .map((row) => {
      const rowValues = columns.map((column) => literal(row[column], jsonColumns.has(column)));
      return `(${rowValues.join(', ')})`;
    })
    .join(',\n');

  return `INSERT INTO "${table.name}" (${columnsSql}) VALUES\n${valuesSql};`;
}

function literal(value, isJson = false) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';

  const raw = isJson && typeof value !== 'string' ? JSON.stringify(value) : String(value);
  const escaped = raw.replace(/'/g, "''");
  return `'${escaped}'`;
}

function loadLocalEnvFiles(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex <= 0) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 1024 * 1024 * 20
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(`${command} failed${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ''}`);
  }

  return result.stdout ?? '';
}

async function safeParseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
