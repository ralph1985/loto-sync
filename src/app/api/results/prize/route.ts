import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { prisma } from '@/lib/prisma'

const toDayStart = (value: string) => new Date(`${value}T00:00:00.000Z`)

const computeTicketStatus = (
  checks: Array<{
    prizeCents: number | null
  }>
) => {
  if (checks.some((check) => (check.prizeCents ?? 0) > 0)) {
    return 'PREMIO' as const
  }
  if (checks.length > 0) {
    return 'COMPROBADO' as const
  }
  return 'PENDIENTE' as const
}

type PrizePayload = {
  ticketId?: string
  drawDate?: string
  prizeCents?: number
}

export async function POST(request: Request) {
  try {
    const actor = await requireSessionUser()
    const payload = (await request.json()) as PrizePayload
    const ticketId = payload.ticketId?.trim()
    const drawDateValue = payload.drawDate?.trim()
    const prizeCents = payload.prizeCents

    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId es obligatorio.' }, { status: 400 })
    }
    if (prizeCents === undefined || !Number.isInteger(prizeCents) || prizeCents < 0) {
      return NextResponse.json(
        { error: 'prizeCents debe ser un entero mayor o igual que 0.' },
        { status: 400 }
      )
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        draw: true
      }
    })

    if (!ticket || !ticket.draw) {
      return NextResponse.json({ error: 'ticketId no existe.' }, { status: 404 })
    }
    await requireGroupAccess(actor.id, ticket.groupId)

    const drawDate = drawDateValue
      ? toDayStart(drawDateValue)
      : ticket.draw.drawDate
        ? toDayStart(ticket.draw.drawDate.toISOString().slice(0, 10))
        : null

    if (!drawDate || Number.isNaN(drawDate.getTime())) {
      return NextResponse.json({ error: 'drawDate no es valida.' }, { status: 400 })
    }

    const data = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const check = await tx.ticketCheck.upsert({
      where: {
        ticketId_drawDate: {
          ticketId,
          drawDate
        }
      },
      update: {
        prizeCents,
        prizeSource: 'MANUAL',
        status: prizeCents > 0 ? 'PREMIO' : 'COMPROBADO',
        checkedAt: new Date()
      },
      create: {
        ticketId,
        drawDate,
        status: prizeCents > 0 ? 'PREMIO' : 'COMPROBADO',
        reason: 'Premio manual',
        winningNumbers: [],
        winningStars: [],
        matchesMain: 0,
        matchesStars: 0,
        prizeCents,
        prizeSource: 'MANUAL',
        checkedAt: new Date()
      }
    })

    if (prizeCents > 0) {
      await tx.groupMovement.upsert({
        where: {
          relatedCheckId_type: {
            relatedCheckId: check.id,
            type: 'PRIZE'
          }
        },
        update: {
          amountCents: prizeCents,
          occurredAt: new Date(),
          note: `Premio manual ticket ${ticketId}`
        },
        create: {
          groupId: ticket.groupId,
          type: 'PRIZE',
          amountCents: prizeCents,
          occurredAt: new Date(),
          note: `Premio manual ticket ${ticketId}`,
          relatedTicketId: ticketId,
          relatedCheckId: check.id
        }
      })
    } else {
      await tx.groupMovement.deleteMany({
        where: {
          relatedCheckId: check.id,
          type: 'PRIZE'
        }
      })
    }

    const checks = await tx.ticketCheck.findMany({
      where: { ticketId },
      select: { prizeCents: true }
    })
    const nextStatus = computeTicketStatus(checks)
    await tx.ticket.update({
      where: { id: ticketId },
      data: { status: nextStatus }
    })

      return {
        check,
        ticketStatus: nextStatus
      }
    })

    await writeAuditLog({
      actorId: actor.id,
      entityType: 'TICKET_CHECK',
      entityId: data.check.id,
      action: 'SET_PRIZE',
      payload: {
        ticketId,
        prizeCents
      }
    })

    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Error al guardar premio.' }, { status: 500 })
  }
}
