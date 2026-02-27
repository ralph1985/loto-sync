import { prisma } from '@/lib/prisma'

export const writeAuditLog = async (input: {
  actorId?: string | null
  entityType: string
  entityId: string
  action: string
  payload?: unknown
}) => {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      payload: input.payload as object | undefined
    }
  })
}
