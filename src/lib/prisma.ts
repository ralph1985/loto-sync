import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient
}

function createPrismaClient(): PrismaClient {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/loto_sync?schema=public'
  if (databaseUrl.startsWith('file:')) {
    throw new Error(
      'SQLite local desactivada. Configura DATABASE_URL con la base de datos Postgres de Vercel.'
    )
  }
  const adapter = new PrismaPg({ connectionString: databaseUrl })

  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as PrismaGlobal

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
