const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const existingGroups = await prisma.group.count()
  const existingDraws = await prisma.draw.count()

  if (existingGroups === 0) {
    await prisma.group.createMany({
      data: [
        { name: 'Amigos', kind: 'AMIGOS' },
        { name: 'Trabajo', kind: 'TRABAJO' },
        { name: 'Pareja', kind: 'PAREJA' }
      ]
    })
  }

  const today = new Date()
  const drawDates = [0, 3, 7].map((offset) => {
    const date = new Date(today)
    date.setDate(today.getDate() + offset)
    date.setHours(20, 0, 0, 0)
    return date
  })

  if (existingDraws === 0) {
    await prisma.draw.createMany({
      data: [
        {
          type: 'PRIMITIVA',
          drawDate: drawDates[0],
          label: 'Primitiva semanal'
        },
        {
          type: 'EUROMILLONES',
          drawDate: drawDates[1],
          label: 'Euromillones'
        },
        {
          type: 'PRIMITIVA',
          drawDate: drawDates[2],
          label: 'Primitiva especial'
        }
      ]
    })
  }

  const amigos = await prisma.group.findFirst({
    where: { name: 'Amigos' },
    select: { id: true }
  })

  if (amigos) {
    const openingDate = new Date('2026-01-06T00:00:00.000Z')
    const existingOpening = await prisma.groupMovement.findFirst({
      where: {
        groupId: amigos.id,
        type: 'OPENING',
        amountCents: 2000,
        occurredAt: openingDate
      }
    })

    if (!existingOpening) {
      await prisma.groupMovement.create({
        data: {
          groupId: amigos.id,
          type: 'OPENING',
          amountCents: 2000,
          occurredAt: openingDate,
          note: 'Saldo inicial 2026'
        }
      })
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
