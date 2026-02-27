import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { fetchResultForDrawDate } from '@/lib/results-client'

const toDateOnly = (value: string) => new Date(value).toISOString().slice(0, 10)
const toDayStart = (value: string) => new Date(`${value}T00:00:00.000Z`)

const computeTicketStatus = (
  checks: Array<{
    prizeCents: number | null
  }>
) => {
  if (checks.some((check) => (check.prizeCents ?? 0) > 0)) return 'PREMIO' as const
  if (checks.length > 0) return 'COMPROBADO' as const
  return 'PENDIENTE' as const
}

type Payload = {
  ticketId?: string
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Payload
  const ticketId = payload.ticketId?.trim()
  if (!ticketId) {
    return NextResponse.json({ error: 'ticketId es obligatorio.' }, { status: 400 })
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      draw: true,
      lines: {
        include: { numbers: true }
      },
      checks: true
    }
  })

  if (!ticket || !ticket.draw) {
    return NextResponse.json({ error: 'ticketId no existe.' }, { status: 404 })
  }

  const line = ticket.lines[0]
  const mainNumbers = line
    ? line.numbers
        .filter((number) => number.kind === 'MAIN')
        .map((number) => number.value)
    : []
  const starNumbers = line
    ? line.numbers
        .filter((number) => number.kind === 'STAR')
        .map((number) => number.value)
    : []

  const dates = ticket.checks.length > 0
    ? ticket.checks.map((check) => toDateOnly(check.drawDate.toISOString()))
    : [toDateOnly(ticket.draw.drawDate.toISOString())]

  let updated = 0
  const details: Array<{ drawDate: string; status: string; matchesMain: number; matchesStars: number }> = []

  for (const drawDate of dates) {
    const parsedDrawDate = toDayStart(drawDate)
    const result = await fetchResultForDrawDate(ticket.draw.type, drawDate)
    const resultDrawDate = result.drawDate ? toDateOnly(result.drawDate) : null
    const hasValidResult = resultDrawDate === drawDate && result.numbers.length > 0
    const matchesMain = hasValidResult
      ? mainNumbers.filter((value) => result.numbers.includes(value)).length
      : 0
    const matchesStars =
      hasValidResult && result.stars
        ? starNumbers.filter((value) => result.stars?.includes(value)).length
        : 0
    const reason = !line
      ? 'El boleto no tiene lineas.'
      : hasValidResult
        ? null
        : 'No hay resultado local para esa fecha.'

    await prisma.$transaction(async (tx) => {
      const existing = await tx.ticketCheck.findUnique({
        where: {
          ticketId_drawDate: {
            ticketId,
            drawDate: parsedDrawDate
          }
        }
      })

      const checkStatus = (existing?.prizeCents ?? 0) > 0
        ? 'PREMIO'
        : hasValidResult
          ? 'COMPROBADO'
          : 'PENDIENTE'

      await tx.ticketCheck.upsert({
        where: {
          ticketId_drawDate: {
            ticketId,
            drawDate: parsedDrawDate
          }
        },
        update: {
          status: checkStatus,
          reason,
          winningNumbers: result.numbers,
          winningStars: result.stars ?? [],
          matchesMain,
          matchesStars,
          checkedAt: new Date()
        },
        create: {
          ticketId,
          drawDate: parsedDrawDate,
          status: checkStatus,
          reason,
          winningNumbers: result.numbers,
          winningStars: result.stars ?? [],
          matchesMain,
          matchesStars,
          checkedAt: new Date()
        }
      })
    })

    details.push({
      drawDate,
      status: hasValidResult ? 'COMPROBADO' : 'PENDIENTE',
      matchesMain,
      matchesStars
    })
    updated += 1
  }

  const checks = await prisma.ticketCheck.findMany({
    where: { ticketId },
    select: { prizeCents: true }
  })
  const nextStatus = computeTicketStatus(checks)
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: nextStatus }
  })

  return NextResponse.json({
    data: {
      ticketId,
      updated,
      ticketStatus: nextStatus,
      details
    }
  })
}
