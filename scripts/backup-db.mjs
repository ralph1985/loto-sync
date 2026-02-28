import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const lotoRoot = resolve(process.cwd());
const source = resolve(lotoRoot, 'data/dev.db');
const backupDir = resolve(lotoRoot, 'backups');
const onedriveDir = resolve(lotoRoot, process.env.ONEDRIVE_SYNC_DIR ?? '../onedrive-file-sync');
const remoteDir = (process.env.ONEDRIVE_REMOTE_DIR ?? 'backups/loto-sync').replace(/\/+$/, '');

if (!existsSync(source)) {
  console.error(`Database not found: ${source}`);
  process.exit(1);
}

if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true });
}

if (!existsSync(onedriveDir)) {
  console.error(`OneDrive sync project not found: ${onedriveDir}`);
  process.exit(1);
}

const now = new Date();
const pad = (value) => String(value).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupPath = resolve(backupDir, `dev-${stamp}.db`);
const remotePath = `${remoteDir}/${basename(backupPath)}`;

copyFileSync(source, backupPath);
console.log(`Local backup ready: ${backupPath}`);
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
