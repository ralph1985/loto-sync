import { NextResponse } from 'next/server'

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

  const drawDate = drawDateValue
    ? toDayStart(drawDateValue)
    : ticket.draw.drawDate
      ? toDayStart(ticket.draw.drawDate.toISOString().slice(0, 10))
      : null

  if (!drawDate || Number.isNaN(drawDate.getTime())) {
    return NextResponse.json({ error: 'drawDate no es valida.' }, { status: 400 })
  }

  const data = await prisma.$transaction(async (tx) => {
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

  return NextResponse.json({ data })
}
