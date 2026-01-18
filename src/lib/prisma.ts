import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL || 'file:./data/dev.db'
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl })

  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as PrismaGlobal

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
