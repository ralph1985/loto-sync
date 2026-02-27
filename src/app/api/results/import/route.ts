import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import {
  fetchResultForDrawDate,
  importResults,
  type ImportResultInput
} from '@/lib/results-client'

type ImportPayload = {
  game?: string
  results?: Array<{
    date?: string
    numbers?: number[]
    stars?: number[]
    complementario?: number | null
    reintegro?: number | null
  }>
}

const normalizeGame = (value?: string) => {
  const raw = (value ?? '').trim().toUpperCase()
  if (raw === 'PRIMITIVA' || raw === 'LA_PRIMITIVA') return 'PRIMITIVA' as const
  if (raw === 'EUROMILLONES') return 'EUROMILLONES' as const
  return null
}

const isValidDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())

const isValidPrimitivaWeekday = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  const weekday = date.getUTCDay()
  return weekday === 1 || weekday === 4 || weekday === 6
}

const validateResults = (
  game: 'PRIMITIVA' | 'EUROMILLONES',
  items: ImportPayload['results']
) => {
  const issues: string[] = []
  const normalized: ImportResultInput[] = []

  ;(items ?? []).forEach((item, index) => {
    const prefix = `results[${index}]`
    const date = item?.date?.trim()
    if (!date || !isValidDate(date)) {
      issues.push(`${prefix}.date no es valida (YYYY-MM-DD).`)
      return
    }
    if (game === 'PRIMITIVA' && !isValidPrimitivaWeekday(date)) {
      issues.push(`${prefix}.date debe caer en lunes, jueves o sabado.`)
      return
    }

    if (!Array.isArray(item.numbers) || item.numbers.length === 0) {
      issues.push(`${prefix}.numbers es obligatorio.`)
      return
    }

    normalized.push({
      date,
      numbers: item.numbers,
      stars: item.stars ?? [],
      complementario: item.complementario ?? null,
      reintegro: item.reintegro ?? null
    })
  })

  return { issues, normalized }
}

const toDateOnly = (value: string) => new Date(value).toISOString().slice(0, 10)
const toDayStart = (value: string) => new Date(`${value}T00:00:00.000Z`)

const computeTicketStatus = (
  checks: Array<{
    status: 'PENDIENTE' | 'COMPROBADO' | 'PREMIO'
    prizeCents: number | null
  }>
) => {
  if (checks.some((check) => check.status === 'PREMIO' || (check.prizeCents ?? 0) > 0)) {
    return 'PREMIO' as const
  }
  if (checks.some((check) => check.status === 'COMPROBADO')) {
    return 'COMPROBADO' as const
  }
  return 'PENDIENTE' as const
}

const syncChecksForImportedDate = async (
  game: 'PRIMITIVA' | 'EUROMILLONES',
  drawDate: string
) => {
  const parsedDrawDate = toDayStart(drawDate)
  const result = await fetchResultForDrawDate(game, drawDate)
  const resultDrawDate = result.drawDate ? toDateOnly(result.drawDate) : null
  const hasValidResult = resultDrawDate === drawDate && result.numbers.length > 0

  const tickets = await prisma.ticket.findMany({
    where: {
      draw: { type: game },
      OR: [
        { checks: { some: { drawDate: parsedDrawDate } } },
        { draw: { drawDate: parsedDrawDate } }
      ]
    },
    include: {
      lines: {
        include: {
          numbers: true
        }
      },
      checks: {
        where: {
          drawDate: parsedDrawDate
        },
        select: {
          prizeCents: true
        }
      }
    }
  })

  let updated = 0
  for (const ticket of tickets) {
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

    const matchesMain = hasValidResult
      ? mainNumbers.filter((value) => result.numbers.includes(value)).length
      : 0
    const matchesStars =
      hasValidResult && result.stars
        ? starNumbers.filter((value) => result.stars?.includes(value)).length
        : 0

    const existing = ticket.checks[0]
    const checkStatus = (existing?.prizeCents ?? 0) > 0 ? 'PREMIO' : hasValidResult ? 'COMPROBADO' : 'PENDIENTE'
    const reason = !line
      ? 'El boleto no tiene lineas.'
      : hasValidResult
        ? null
        : 'No hay resultado local para esa fecha.'

    await prisma.ticketCheck.upsert({
      where: {
        ticketId_drawDate: {
          ticketId: ticket.id,
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
        ticketId: ticket.id,
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

    const allChecks = await prisma.ticketCheck.findMany({
      where: { ticketId: ticket.id },
      select: { status: true, prizeCents: true }
    })
    const nextStatus = computeTicketStatus(allChecks)
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: nextStatus }
    })
    updated += 1
  }

  return updated
}

export async function POST(request: Request) {
  const payload = (await request.json()) as ImportPayload
  const game = normalizeGame(payload.game)
  if (!game) {
    return NextResponse.json(
      { error: 'game debe ser PRIMITIVA o EUROMILLONES.' },
      { status: 400 }
    )
  }

  if (!Array.isArray(payload.results) || payload.results.length === 0) {
    return NextResponse.json(
      { error: 'results debe incluir al menos un sorteo.' },
      { status: 400 }
    )
  }

  const { issues, normalized } = validateResults(game, payload.results)
  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'Validacion fallida.', issues },
      { status: 400 }
    )
  }

  const imported = await importResults(game, normalized)
  const uniqueDates = [...new Set(normalized.map((item) => item.date))]
  let syncedChecks = 0
  for (const date of uniqueDates) {
    syncedChecks += await syncChecksForImportedDate(game, date)
  }

  return NextResponse.json({
    data: {
      game,
      imported,
      syncedChecks
    }
  })
}
