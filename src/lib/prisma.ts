import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient
}

function createPrismaClient(): PrismaClient {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/loto_sync?schema=public'
  const adapter = new PrismaPg({ connectionString: databaseUrl })

  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as PrismaGlobal

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
