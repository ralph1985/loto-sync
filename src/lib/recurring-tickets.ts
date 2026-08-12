import { prisma } from '@/lib/prisma'

export type RecurringNumbers = {
  mainNumbers: number[]
  starNumbers: number[]
}

export const validateEuromillionsNumbers = ({ mainNumbers, starNumbers }: RecurringNumbers) => {
  const issues: string[] = []
  if (mainNumbers.length !== 5 || new Set(mainNumbers).size !== 5 || mainNumbers.some((value) => value < 1 || value > 50)) {
    issues.push('mainNumbers debe contener 5 numeros distintos entre 1 y 50.')
  }
  if (starNumbers.length !== 2 || new Set(starNumbers).size !== 2 || starNumbers.some((value) => value < 1 || value > 12)) {
    issues.push('starNumbers debe contener 2 estrellas distintas entre 1 y 12.')
  }
  return issues
}

export const isEuromillionsDrawDate = (date: Date) => {
  const weekday = date.getUTCDay()
  return weekday === 2 || weekday === 5
}

export const nextEuromillionsDrawDate = (from = new Date()) => {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  while (!isEuromillionsDrawDate(date)) date.setUTCDate(date.getUTCDate() + 1)
  return date
}

export const ensureRecurringTickets = async (through = nextEuromillionsDrawDate()) => {
  const recurring = await prisma.recurringTicket.findMany({ where: { active: true } })
  let created = 0
  for (const definition of recurring) {
    const firstDate = new Date(Math.max(definition.startDate.getTime(), through.getTime()))
    const drawDate = nextEuromillionsDrawDate(firstDate)
    if (drawDate < definition.startDate) continue

    const draw = await prisma.draw.upsert({
      where: { type_drawDate: { type: definition.drawType, drawDate } },
      update: {},
      create: { type: definition.drawType, drawDate }
    })
    const existing = await prisma.ticket.findUnique({
      where: { recurringTicketId_drawId: { recurringTicketId: definition.id, drawId: draw.id } },
      select: { id: true }
    })
    if (existing) continue

    const mainNumbers = Array.isArray(definition.mainNumbers) ? definition.mainNumbers.map(Number) : []
    const starNumbers = Array.isArray(definition.starNumbers) ? definition.starNumbers.map(Number) : []
    await prisma.ticket.create({
      data: {
        groupId: definition.groupId,
        drawId: draw.id,
        recurringTicketId: definition.id,
        status: 'PENDIENTE',
        purchaseStatus: 'PENDING_CONFIRMATION',
        notes: 'Boleto generado por apuesta recurrente.',
        lines: {
          create: {
            lineIndex: 1,
            numbers: {
              create: [
                ...mainNumbers.map((value, position) => ({ kind: 'MAIN' as const, position: position + 1, value })),
                ...starNumbers.map((value, position) => ({ kind: 'STAR' as const, position: position + 1, value }))
              ]
            }
          }
        },
        checks: {
          create: {
            drawDate,
            status: 'PENDIENTE',
            reason: 'Pendiente de confirmacion de compra.',
            winningNumbers: [],
            winningStars: []
          }
        }
      }
    })
    created += 1
  }
  return created
}
