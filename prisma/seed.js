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
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
