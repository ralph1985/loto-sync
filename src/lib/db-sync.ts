// @ts-nocheck
import { prisma } from '@/lib/prisma'

type SyncTableConfig = {
  name: keyof SyncDataset
  dateFields: string[]
}

export type SyncDataset = {
  User: Array<Record<string, unknown>>
  Group: Array<Record<string, unknown>>
  Draw: Array<Record<string, unknown>>
  GroupMember: Array<Record<string, unknown>>
  GroupInvitation: Array<Record<string, unknown>>
  Ticket: Array<Record<string, unknown>>
  TicketLine: Array<Record<string, unknown>>
  TicketLineNumber: Array<Record<string, unknown>>
  Receipt: Array<Record<string, unknown>>
  TicketCheck: Array<Record<string, unknown>>
  GroupMovement: Array<Record<string, unknown>>
  ResultCache: Array<Record<string, unknown>>
  AuditLog: Array<Record<string, unknown>>
}

export type SyncSummary = {
  totalRows: number
  maxDate: string | null
  rowsByTable: Record<string, number>
}

const TABLES: SyncTableConfig[] = [
  { name: 'User', dateFields: ['createdAt', 'updatedAt'] },
  { name: 'Group', dateFields: ['createdAt', 'updatedAt'] },
  { name: 'Draw', dateFields: ['drawDate', 'createdAt', 'updatedAt'] },
  { name: 'GroupMember', dateFields: ['createdAt'] },
  { name: 'GroupInvitation', dateFields: ['createdAt', 'updatedAt'] },
  { name: 'Ticket', dateFields: ['createdAt', 'updatedAt'] },
  { name: 'TicketLine', dateFields: ['createdAt'] },
  { name: 'TicketLineNumber', dateFields: ['createdAt'] },
  { name: 'Receipt', dateFields: ['createdAt'] },
  { name: 'TicketCheck', dateFields: ['drawDate', 'checkedAt', 'createdAt', 'updatedAt'] },
  { name: 'GroupMovement', dateFields: ['occurredAt', 'createdAt'] },
  { name: 'ResultCache', dateFields: ['drawDate', 'fetchedAt', 'createdAt', 'updatedAt'] },
  { name: 'AuditLog', dateFields: ['createdAt'] }
]

export const buildSyncSummary = (dataset: SyncDataset): SyncSummary => {
  let totalRows = 0
  let maxTimestamp: number | null = null
  const rowsByTable: Record<string, number> = {}

  for (const table of TABLES) {
    const rows = dataset[table.name] ?? []
    rowsByTable[table.name] = rows.length
    totalRows += rows.length

    for (const row of rows) {
      for (const field of table.dateFields) {
        const value = row[field]
        if (!value) continue
        const timestamp = new Date(String(value)).getTime()
        if (Number.isNaN(timestamp)) continue
        if (maxTimestamp === null || timestamp > maxTimestamp) {
          maxTimestamp = timestamp
        }
      }
    }
  }

  return {
    totalRows,
    maxDate: maxTimestamp === null ? null : new Date(maxTimestamp).toISOString(),
    rowsByTable
  }
}

export const shouldBlockOverwrite = (source: SyncSummary, target: SyncSummary) => {
  const targetHasMoreRows = target.totalRows > source.totalRows
  const targetIsNewer =
    target.maxDate !== null && source.maxDate !== null && target.maxDate > source.maxDate

  return targetHasMoreRows || targetIsNewer
}

export const exportSyncDataset = async (): Promise<SyncDataset> => {
  const [users, groups, draws, groupMembers, invitations, tickets, lines, lineNumbers, receipts, checks, movements, cache, auditLogs] =
    await Promise.all([
      prisma.user.findMany(),
      prisma.group.findMany(),
      prisma.draw.findMany(),
      prisma.groupMember.findMany(),
      prisma.groupInvitation.findMany(),
      prisma.ticket.findMany(),
      prisma.ticketLine.findMany(),
      prisma.ticketLineNumber.findMany(),
      prisma.receipt.findMany(),
      prisma.ticketCheck.findMany(),
      prisma.groupMovement.findMany(),
      prisma.resultCache.findMany(),
      prisma.auditLog.findMany()
    ])

  return {
    User: users,
    Group: groups,
    Draw: draws,
    GroupMember: groupMembers,
    GroupInvitation: invitations,
    Ticket: tickets,
    TicketLine: lines,
    TicketLineNumber: lineNumbers,
    Receipt: receipts,
    TicketCheck: checks,
    GroupMovement: movements,
    ResultCache: cache,
    AuditLog: auditLogs
  }
}

const toDate = (value: unknown) => (value ? new Date(String(value)) : undefined)

export const replaceSyncDataset = async (dataset: SyncDataset) => {
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany()
    await tx.resultCache.deleteMany()
    await tx.groupMovement.deleteMany()
    await tx.ticketCheck.deleteMany()
    await tx.receipt.deleteMany()
    await tx.ticketLineNumber.deleteMany()
    await tx.ticketLine.deleteMany()
    await tx.ticket.deleteMany()
    await tx.groupInvitation.deleteMany()
    await tx.groupMember.deleteMany()
    await tx.draw.deleteMany()
    await tx.group.deleteMany()
    await tx.user.deleteMany()

    if (dataset.User.length > 0) {
      await tx.user.createMany({
        data: dataset.User.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          passwordHash: String(row.passwordHash),
          createdAt: toDate(row.createdAt),
          updatedAt: toDate(row.updatedAt)
        }))
      })
    }

    if (dataset.Group.length > 0) {
      await tx.group.createMany({
        data: dataset.Group.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          kind: row.kind ? String(row.kind) : null,
          createdAt: toDate(row.createdAt),
          updatedAt: toDate(row.updatedAt)
        }))
      })
    }

    if (dataset.Draw.length > 0) {
      await tx.draw.createMany({
        data: dataset.Draw.map((row) => ({
          id: String(row.id),
          type: String(row.type),
          drawDate: toDate(row.drawDate),
          label: row.label ? String(row.label) : null,
          createdAt: toDate(row.createdAt),
          updatedAt: toDate(row.updatedAt)
        }))
      })
    }

    if (dataset.GroupMember.length > 0) {
      await tx.groupMember.createMany({
        data: dataset.GroupMember.map((row) => ({
          id: String(row.id),
          groupId: String(row.groupId),
          userId: String(row.userId),
          role: String(row.role),
          createdAt: toDate(row.createdAt)
        }))
      })
    }

    if (dataset.GroupInvitation.length > 0) {
      await tx.groupInvitation.createMany({
        data: dataset.GroupInvitation.map((row) => ({
          id: String(row.id),
          groupId: String(row.groupId),
          inviterId: String(row.inviterId),
          inviteeId: row.inviteeId ? String(row.inviteeId) : null,
          role: String(row.role),
          status: String(row.status),
          note: row.note ? String(row.note) : null,
          createdAt: toDate(row.createdAt),
          updatedAt: toDate(row.updatedAt)
        }))
      })
    }

    if (dataset.Ticket.length > 0) {
      await tx.ticket.createMany({
        data: dataset.Ticket.map((row) => ({
          id: String(row.id),
          groupId: String(row.groupId),
          drawId: String(row.drawId),
          status: String(row.status),
          priceCents:
            typeof row.priceCents === 'number' ? row.priceCents : row.priceCents ? Number(row.priceCents) : null,
          playsJoker: Boolean(row.playsJoker),
          jokerNumber: row.jokerNumber ? String(row.jokerNumber) : null,
          notes: row.notes ? String(row.notes) : null,
          createdAt: toDate(row.createdAt),
          updatedAt: toDate(row.updatedAt)
        }))
      })
    }

    if (dataset.TicketLine.length > 0) {
      await tx.ticketLine.createMany({
        data: dataset.TicketLine.map((row) => ({
          id: String(row.id),
          ticketId: String(row.ticketId),
          complement:
            typeof row.complement === 'number'
              ? row.complement
              : row.complement === null || row.complement === undefined
                ? null
                : Number(row.complement),
          reintegro:
            typeof row.reintegro === 'number'
              ? row.reintegro
              : row.reintegro === null || row.reintegro === undefined
                ? null
                : Number(row.reintegro),
          lineIndex: typeof row.lineIndex === 'number' ? row.lineIndex : Number(row.lineIndex),
          createdAt: toDate(row.createdAt)
        }))
      })
    }

    if (dataset.TicketLineNumber.length > 0) {
      await tx.ticketLineNumber.createMany({
        data: dataset.TicketLineNumber.map((row) => ({
          id: String(row.id),
          lineId: String(row.lineId),
          kind: String(row.kind),
          position: typeof row.position === 'number' ? row.position : Number(row.position),
          value: typeof row.value === 'number' ? row.value : Number(row.value),
          createdAt: toDate(row.createdAt)
        }))
      })
    }

    if (dataset.Receipt.length > 0) {
      await tx.receipt.createMany({
        data: dataset.Receipt.map((row) => ({
          id: String(row.id),
          ticketId: String(row.ticketId),
          blobUrl: String(row.blobUrl),
          blobPath: row.blobPath ? String(row.blobPath) : null,
          mimeType: row.mimeType ? String(row.mimeType) : null,
          sizeBytes:
            typeof row.sizeBytes === 'number'
              ? row.sizeBytes
              : row.sizeBytes === null || row.sizeBytes === undefined
                ? null
                : Number(row.sizeBytes),
          createdAt: toDate(row.createdAt)
        }))
      })
    }

    if (dataset.TicketCheck.length > 0) {
      await tx.ticketCheck.createMany({
        data: dataset.TicketCheck.map((row) => ({
          id: String(row.id),
          ticketId: String(row.ticketId),
          drawDate: toDate(row.drawDate),
          status: String(row.status),
          reason: row.reason ? String(row.reason) : null,
          winningNumbers: row.winningNumbers,
          winningStars: row.winningStars ?? null,
          matchesMain: typeof row.matchesMain === 'number' ? row.matchesMain : Number(row.matchesMain),
          matchesStars:
            typeof row.matchesStars === 'number' ? row.matchesStars : Number(row.matchesStars),
          prizeCents:
            typeof row.prizeCents === 'number'
              ? row.prizeCents
              : row.prizeCents === null || row.prizeCents === undefined
                ? null
                : Number(row.prizeCents),
          prizeSource: row.prizeSource ? String(row.prizeSource) : null,
          checkedAt: toDate(row.checkedAt),
          createdAt: toDate(row.createdAt),
          updatedAt: toDate(row.updatedAt)
        }))
      })
    }

    if (dataset.GroupMovement.length > 0) {
      await tx.groupMovement.createMany({
        data: dataset.GroupMovement.map((row) => ({
          id: String(row.id),
          groupId: String(row.groupId),
          type: String(row.type),
          amountCents: typeof row.amountCents === 'number' ? row.amountCents : Number(row.amountCents),
          occurredAt: toDate(row.occurredAt),
          note: row.note ? String(row.note) : null,
          relatedTicketId: row.relatedTicketId ? String(row.relatedTicketId) : null,
          relatedCheckId: row.relatedCheckId ? String(row.relatedCheckId) : null,
          createdAt: toDate(row.createdAt)
        }))
      })
    }

    if (dataset.ResultCache.length > 0) {
      await tx.resultCache.createMany({
        data: dataset.ResultCache.map((row) => ({
          id: String(row.id),
          game: String(row.game),
          drawDate: row.drawDate ? toDate(row.drawDate) : null,
          payload: row.payload,
          fetchedAt: toDate(row.fetchedAt),
          createdAt: toDate(row.createdAt),
          updatedAt: toDate(row.updatedAt)
        }))
      })
    }

    if (dataset.AuditLog.length > 0) {
      await tx.auditLog.createMany({
        data: dataset.AuditLog.map((row) => ({
          id: String(row.id),
          actorId: row.actorId ? String(row.actorId) : null,
          entityType: String(row.entityType),
          entityId: String(row.entityId),
          action: String(row.action),
          payload: row.payload ?? null,
          createdAt: toDate(row.createdAt)
        }))
      })
    }
  })
}

export const isSyncDataset = (value: unknown): value is SyncDataset => {
  if (!value || typeof value !== 'object') return false
  return TABLES.every((table) => Array.isArray((value as Record<string, unknown>)[table.name]))
}

export const requireSyncToken = (request: Request) => {
  const expected = process.env.DB_SYNC_TOKEN
  if (!expected) return { ok: false as const, message: 'DB_SYNC_TOKEN no configurado.' }

  const incoming =
    request.headers.get('x-db-sync-token') ??
    request.headers.get('x-sync-token') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  if (!incoming || incoming !== expected) {
    return { ok: false as const, message: 'Token de sincronizacion no valido.' }
  }

  return { ok: true as const }
}
