const { PrismaClient } = require('@prisma/client')

const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3')

const databaseUrl = process.env.DATABASE_URL || 'file:./data/dev.db'
const adapter = new PrismaBetterSqlite3({ url: databaseUrl })
const prisma = new PrismaClient({ adapter })

async function main() {
  const existing = await prisma.group.count()
  if (existing > 0) {
    return
  }

  await prisma.group.createMany({
    data: [
      { name: 'Amigos', kind: 'AMIGOS' },
      { name: 'Trabajo', kind: 'TRABAJO' },
      { name: 'Pareja', kind: 'PAREJA' }
    ]
  })

  const today = new Date()
  const drawDates = [0, 3, 7].map((offset) => {
    const date = new Date(today)
    date.setDate(today.getDate() + offset)
    date.setHours(20, 0, 0, 0)
    return date
  })

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

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
