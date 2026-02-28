import { PrismaClient } from '@prisma/client'

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient()
}

const globalForPrisma = globalThis as PrismaGlobal

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
