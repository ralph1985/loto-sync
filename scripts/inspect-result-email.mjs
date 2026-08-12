import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { simpleParser } from 'mailparser';
import { loadResultFilters, matchResultFilter, validateExtraction } from './results-parser.mjs';

const root = resolve(process.cwd());
const fileFlag = process.argv.indexOf('--file');
const filePath = fileFlag >= 0 ? resolve(root, process.argv[fileFlag + 1] ?? '') : null;
if (!filePath || !existsSync(filePath)) throw new Error('Uso: npm run results:inspect -- --file ./resultado.eml');

loadLocalEnvFiles(resolve(root, '.env.local'));
loadLocalEnvFiles(resolve(root, '.env'));
const parsed = await simpleParser(readFileSync(filePath));
const filter = matchResultFilter(parsed, loadResultFilters(process.env));
if (!filter) throw new Error('El correo no coincide con ningún filtro configurado.');
const extraction = await extractWithCodex(filePath, filter.game);
const result = validateExtraction(extraction, filter.game);
process.stdout.write(`${JSON.stringify({ filterId: filter.id, ...result })}\n`);

function loadLocalEnvFiles(envPath) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

function extractWithCodex(emlPath, game) {
  const codex = process.env.RESULTS_CODEX_BIN ?? '/home/rafa/.local/bin/codex';
  const prompt = [
    `Lee únicamente el correo EML indicado y extrae el resultado del sorteo de ${game === 'EUROMILLONES' ? 'Euromillón' : 'La Primitiva'}.`,
    `Fichero: ${emlPath}`,
    game === 'EUROMILLONES'
      ? 'Devuelve exclusivamente JSON: {"date":"YYYY-MM-DD","numbers":[1,2,3,4,5],"stars":[1,2],"elMillionCode":"ABC12345"}.'
      : 'Devuelve exclusivamente JSON: {"date":"YYYY-MM-DD","numbers":[1,2,3,4,5,6],"complementario":0,"reintegro":0}.',
    'date es la fecha real del sorteo. No inventes valores.',
    'Si no puedes determinar con seguridad todos los campos, devuelve exactamente {"error":"resultado no determinable"}.'
  ].join('\n');
  return new Promise((resolveOutput, reject) => {
    const child = spawn(codex, ['exec', '-s', 'read-only', '-C', root, '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Codex superó el tiempo máximo de 5 minutos.')); }, 300_000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error((stderr || `Codex terminó con código ${code}`).trim()));
      try {
        const cleaned = stdout.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        resolveOutput(JSON.parse(cleaned));
      } catch { reject(new Error('Codex no devolvió JSON válido.')); }
    });
    child.stdin.end(prompt);
  });
}
