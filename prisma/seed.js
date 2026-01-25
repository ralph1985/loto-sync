const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

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
