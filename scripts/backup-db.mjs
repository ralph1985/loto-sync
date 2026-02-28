import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const lotoRoot = resolve(process.cwd());
const backupDir = resolve(lotoRoot, 'backups');
const onedriveDir = resolve(lotoRoot, process.env.ONEDRIVE_SYNC_DIR ?? '../onedrive-file-sync');
const remoteDir = (process.env.ONEDRIVE_REMOTE_DIR ?? 'backups/loto-sync').replace(/\/+$/, '');

loadLocalEnvFiles(resolve(lotoRoot, '.env.local'));
loadLocalEnvFiles(resolve(lotoRoot, '.env'));

const syncToken = process.env.DB_SYNC_TOKEN;
const remoteBaseUrl = resolveRemoteBaseUrl();
if (!syncToken) {
  console.error('Missing DB_SYNC_TOKEN in .env.local/.env');
  process.exit(1);
}

if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true });
}

if (!existsSync(onedriveDir)) {
  console.error(`OneDrive sync project not found: ${onedriveDir}`);
  process.exit(1);
}

const dataset = await fetchRemoteExport(remoteBaseUrl, syncToken);

const now = new Date();
const pad = (value) => String(value).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupPath = resolve(backupDir, `vercel-postgres-${stamp}.json`);
const remotePath = `${remoteDir}/${basename(backupPath)}`;

const payload = JSON.stringify(
  {
    exportedAt: now.toISOString(),
    source: remoteBaseUrl,
    dataset
  },
  null,
  2
);

writeFileSync(backupPath, payload, 'utf8');
console.log(`Remote backup ready: ${backupPath}`);
console.log(`Uploading to OneDrive path: ${remotePath}`);

const result = spawnSync('./run.sh', ['--local', backupPath, '--remote', remotePath], {
  cwd: onedriveDir,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error instanceof Error ? result.error.message : String(result.error));
  process.exit(1);
}

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status);
}

console.log('OneDrive upload completed.');

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

function resolveRemoteBaseUrl() {
  const raw = process.env.REMOTE_SYNC_BASE_URL ?? process.env.VERCEL_URL;
  if (!raw) {
    console.error('Missing REMOTE_SYNC_BASE_URL in .env.local/.env');
    process.exit(1);
  }
  const normalized = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
  return normalized.replace(/\/+$/, '');
}

async function fetchRemoteExport(baseUrl, token) {
  const response = await fetch(`${baseUrl}/api/admin/db-sync/export`, {
    headers: {
      'x-db-sync-token': token
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
  return dataset;
}

async function safeParseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
