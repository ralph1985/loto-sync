import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

loadLocalEnv('.env.local');
loadLocalEnv('.env');

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')) {
  throw new Error('DATABASE_URL debe apuntar a PostgreSQL remoto.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const execFileAsync = promisify(execFile);
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

try {
  const recurring = await prisma.recurringTicket.findMany({ where: { active: true } });
  await execFileAsync('npm', ['run', 'backup:db'], { cwd: process.cwd(), env: process.env, maxBuffer: 2_000_000 });
  let created = 0;
  for (const definition of recurring) {
    const start = new Date(Math.max(definition.startDate.getTime(), today.getTime()));
    const drawDate = nextDraw(start);
    const draw = await prisma.draw.upsert({
      where: { type_drawDate: { type: definition.drawType, drawDate } },
      update: {},
      create: { type: definition.drawType, drawDate }
    });
    const existing = await prisma.ticket.findUnique({
      where: { recurringTicketId_drawId: { recurringTicketId: definition.id, drawId: draw.id } },
      select: { id: true }
    });
    if (existing) continue;
    const mainNumbers = Array.isArray(definition.mainNumbers) ? definition.mainNumbers.map(Number) : [];
    const starNumbers = Array.isArray(definition.starNumbers) ? definition.starNumbers.map(Number) : [];
    await prisma.ticket.create({
      data: {
        groupId: definition.groupId,
        drawId: draw.id,
        recurringTicketId: definition.id,
        purchaseStatus: 'PENDING_CONFIRMATION',
        status: 'PENDIENTE',
        notes: 'Boleto generado por apuesta recurrente.',
        lines: { create: { lineIndex: 1, numbers: { create: [
          ...mainNumbers.map((value, position) => ({ kind: 'MAIN', position: position + 1, value })),
          ...starNumbers.map((value, position) => ({ kind: 'STAR', position: position + 1, value }))
        ] } } },
        checks: { create: { drawDate, status: 'PENDIENTE', reason: 'Pendiente de confirmacion de compra.', winningNumbers: [], winningStars: [] } }
      }
    });
    created += 1;
  }
  if (created > 0) await execFileAsync('npm', ['run', 'backup:db'], { cwd: process.cwd(), env: process.env, maxBuffer: 2_000_000 });
  console.log(`Recurring tickets created: ${created}`);
} finally {
  await prisma.$disconnect();
}

function nextDraw(from) {
  const date = new Date(from);
  date.setUTCHours(0, 0, 0, 0);
  while (![2, 5].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function loadLocalEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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
