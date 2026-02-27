import { NextResponse } from 'next/server'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchResultForDrawDate } from '@/lib/results-client'

const toDateOnly = (value: string) => new Date(value).toISOString().slice(0, 10)
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

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser()
    const { searchParams } = new URL(request.url)
    const ticketId = searchParams.get('ticketId')
    const drawDateQuery = searchParams.get('drawDate')

    if (!ticketId) {
      return NextResponse.json(
        { error: 'ticketId es obligatorio.' },
        { status: 400 }
      )
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        draw: true,
        lines: {
          include: { numbers: true }
        }
      }
    })

    if (!ticket || !ticket.draw) {
      return NextResponse.json(
        { error: 'ticketId no existe o no tiene sorteo.' },
        { status: 404 }
      )
    }
    await requireGroupAccess(user.id, ticket.groupId)

    const ticketDrawDate = drawDateQuery
      ? toDateOnly(drawDateQuery)
      : ticket.draw.drawDate
      ? toDateOnly(ticket.draw.drawDate.toISOString())
      : null
    const parsedDrawDate = ticketDrawDate ? toDayStart(ticketDrawDate) : null

    if (!ticketDrawDate || !parsedDrawDate || Number.isNaN(parsedDrawDate.getTime())) {
      return NextResponse.json({
        data: {
          status: 'PENDIENTE',
          reason: 'La fecha del sorteo no es valida.'
        }
      })
    }

    const result = ticketDrawDate
      ? await fetchResultForDrawDate(ticket.draw.type, ticketDrawDate)
      : await fetchResultForDrawDate(ticket.draw.type, new Date().toISOString().slice(0, 10))
    const resultDrawDate = result.drawDate ? toDateOnly(result.drawDate) : null
    const hasValidResult =
      ticketDrawDate === resultDrawDate &&
      Array.isArray(result.numbers) &&
      result.numbers.length > 0

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

    const mainMatches = hasValidResult
      ? mainNumbers.filter((value) => result.numbers.includes(value)).length
      : 0
    const starsMatches =
      hasValidResult && result.stars
        ? starNumbers.filter((value) => result.stars?.includes(value)).length
        : 0

    const reason = !line
      ? 'El boleto no tiene lineas.'
      : !hasValidResult
        ? resultDrawDate && ticketDrawDate !== resultDrawDate
          ? `El resultado recibido (${resultDrawDate}) no coincide con la fecha del sorteo (${ticketDrawDate}).`
          : 'No hay resultado disponible para esa fecha en la base local.'
        : null

    const payload = await prisma.$transaction(async (tx) => {
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

      const check = await tx.ticketCheck.upsert({
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
          matchesMain: mainMatches,
          matchesStars: starsMatches,
          checkedAt: new Date()
        },
        create: {
          ticketId,
          drawDate: parsedDrawDate,
          status: checkStatus,
          reason,
          winningNumbers: result.numbers,
          winningStars: result.stars ?? [],
          matchesMain: mainMatches,
          matchesStars: starsMatches,
          checkedAt: new Date()
        }
      })

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
        status: checkStatus,
        reason,
        matches: {
          main: mainMatches,
          stars: starsMatches
        },
        result,
        check
      }
    })

    return NextResponse.json({ data: payload })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al verificar.' },
      { status: 500 }
    )
  }
}
