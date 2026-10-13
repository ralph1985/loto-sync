import { spawn as defaultSpawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const DEFAULT_TIMEOUT_MS = 15_000;

export function fallbackPrizePhrase(prizeCents) {
  if (prizeCents <= 0) return 'La Champions tendrá que esperar: hoy nos llevamos experiencia y poco más.';
  if (prizeCents < 5_000) return 'No da para fichar a Mbappé, pero al menos paga el aperitivo.';
  return 'Que suene el himno: esto ya merece una vuelta de honor.';
}

export async function generatePrizePhrase({ prizeCents, generate = runCodexPhrase }) {
  try {
    const phrase = normalizePhrase(await generate({ prizeCents }));
    if (!phrase) throw new Error('Codex devolvió una frase vacía o demasiado larga.');
    return phrase;
  } catch (error) {
    console.warn(`No se pudo generar la frase del premio; se usará el respaldo: ${error instanceof Error ? error.message : String(error)}`);
    return fallbackPrizePhrase(prizeCents);
  }
}

export async function generatePrizePhrases(rows, { generate = runCodexPhrase } = {}) {
  const entries = await Promise.all(rows.map(async (row) => [
    row.ticketId,
    await generatePrizePhrase({ prizeCents: row.prizeCents, generate })
  ]));
  return new Map(entries);
}

export function normalizePhrase(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 5 && cleaned.length <= 140 ? cleaned : null;
}

async function runCodexPhrase({ prizeCents, codexBin, timeoutMs, spawnProcess = defaultSpawn }) {
  const executable = codexBin ?? process.env.RESULTS_CODEX_BIN ?? '/home/rafa/.local/bin/codex';
  const configuredTimeout = Number(timeoutMs ?? process.env.RESULTS_CODEX_PHRASE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const timeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : DEFAULT_TIMEOUT_MS;
  const amount = (prizeCents / 100).toFixed(2);
  const prompt = [
    'Escribe una única frase breve en español de España para un correo de resultados de lotería.',
    `El premio total de este boleto es ${amount} euros.`,
    'Usa un tono de celebración desenfadada, como si el grupo hubiese ganado la Champions.',
    'Distingue entre 0 euros, menos de 50 euros y 50 euros o más.',
    'No menciones que eres una IA, no uses comillas ni Markdown y no añadas ningún prefijo.',
    'Devuelve exclusivamente la frase, con un máximo de 140 caracteres.'
  ].join('\n');

  return new Promise((resolveOutput, reject) => {
    let settled = false;
    let child;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      child?.kill('SIGTERM');
      finish(reject, new Error(`Codex superó el tiempo máximo de ${timeout} ms.`));
    }, timeout);

    try {
      child = spawnProcess(executable, ['exec', '-s', 'read-only', '-C', root, '-'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', (error) => finish(reject, error));
      child.on('close', (code) => {
        if (code !== 0) {
          finish(reject, new Error((stderr || `Codex terminó con código ${code}`).trim()));
          return;
        }
        finish(resolveOutput, stdout);
      });
      child.stdin.end(prompt);
    } catch (error) {
      finish(reject, error);
    }
  });
}
