const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')

const databaseUrl =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/loto_sync?schema=public'
const adapter = new PrismaPg({ connectionString: databaseUrl })
const prisma = new PrismaClient({ adapter })

async function main() {
  const tickets = await prisma.ticket.findMany({
    where: {
      priceCents: {
        gt: 0
      }
    },
    include: {
      draw: {
        select: {
          type: true,
          drawDate: true
        }
      }
    }
  })

  let created = 0

  for (const ticket of tickets) {
    const exists = await prisma.groupMovement.findFirst({
      where: {
        type: 'TICKET_EXPENSE',
        relatedTicketId: ticket.id
      },
      select: { id: true }
    })

    if (exists) continue

    const drawDate = ticket.draw?.drawDate
      ? ticket.draw.drawDate.toISOString().slice(0, 10)
      : ''

    await prisma.groupMovement.create({
      data: {
        groupId: ticket.groupId,
        type: 'TICKET_EXPENSE',
        amountCents: -(ticket.priceCents || 0),
        occurredAt: ticket.createdAt,
        note: `Backfill ticket ${ticket.draw?.type || 'DRAW'} ${drawDate}`.trim(),
        relatedTicketId: ticket.id
      }
    })
    created += 1
  }

  console.log(`Movimientos creados: ${created}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
