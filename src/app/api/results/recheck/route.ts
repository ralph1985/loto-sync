import { NextResponse } from 'next/server'

import { ApiAuthError, requireGroupAccess, requireSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchResultForDrawDate } from '@/lib/results-client'
import { computeLineResults, hasAnyElMillionMatch } from '@/features/results/line-results'

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
  try {
    const user = await requireSessionUser()
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
      },
    })

    if (!ticket || !ticket.draw) {
      return NextResponse.json({ error: 'ticketId no existe.' }, { status: 404 })
    }
    await requireGroupAccess(user.id, ticket.groupId)
    if (ticket.purchaseStatus !== 'CONFIRMED') {
      return NextResponse.json(
        { error: 'El boleto todavía no está confirmado como comprado.' },
        { status: 409 }
      )
    }

  const dates = ticket.checks.length > 0
    ? ticket.checks.map((check: (typeof ticket.checks)[number]) => toDateOnly(check.drawDate.toISOString()))
    : [toDateOnly(ticket.draw.drawDate.toISOString())]

    let updated = 0
    const details: Array<{ drawDate: string; status: string; matchesMain: number; matchesStars: number }> = []

    for (const drawDate of dates) {
    const parsedDrawDate = toDayStart(drawDate)
    const result = await fetchResultForDrawDate(ticket.draw.type, drawDate)
    const resultDrawDate = result.drawDate ? toDateOnly(result.drawDate) : null
    const hasValidResult = resultDrawDate === drawDate && result.numbers.length > 0
    const lineResults = hasValidResult
      ? computeLineResults(ticket.lines.map((line) => ({
          lineIndex: line.lineIndex,
          mainNumbers: line.numbers.filter((number) => number.kind === 'MAIN').map((number) => number.value),
          starNumbers: line.numbers.filter((number) => number.kind === 'STAR').map((number) => number.value),
          elMillionCode: line.elMillionCode
        })), result.numbers, result.stars ?? [], result.elMillionCode, ticket.elMillionCode)
      : []
    const primaryResult = lineResults[0]
    const matchesMain = primaryResult?.matchesMain ?? 0
    const matchesStars = primaryResult?.matchesStars ?? 0
    const reason = ticket.lines.length === 0
      ? 'El boleto no tiene lineas.'
      : hasValidResult
        ? null
        : 'No hay resultado local para esa fecha.'

    await prisma.$transaction(async (tx: unknown) => {
      const db = tx as typeof prisma
      const existing = await db.ticketCheck.findUnique({
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

      await db.ticketCheck.upsert({
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
          elMillionMatch: hasAnyElMillionMatch(lineResults),
          lineResults,
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
          elMillionMatch: hasAnyElMillionMatch(lineResults),
          lineResults,
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
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Error al recomprobar ticket.' }, { status: 500 })
  }
}
