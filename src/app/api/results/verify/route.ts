import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { fetchLatestResult } from '@/lib/results-client'

const toDateOnly = (value: string) => new Date(value).toISOString().slice(0, 10)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ticketId = searchParams.get('ticketId')

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

  try {
    const result = await fetchLatestResult(ticket.draw.type)
    const ticketDrawDate = ticket.draw.drawDate
      ? toDateOnly(ticket.draw.drawDate.toISOString())
      : null
    const resultDrawDate = result.drawDate ? toDateOnly(result.drawDate) : null

    if (!ticketDrawDate || ticketDrawDate !== resultDrawDate) {
      return NextResponse.json({
        data: {
          status: 'PENDIENTE',
          reason: 'El resultado aun no coincide con la fecha del sorteo.',
          result
        }
      })
    }

    const line = ticket.lines[0]
    if (!line) {
      return NextResponse.json({
        data: {
          status: 'PENDIENTE',
          reason: 'El boleto no tiene lineas.',
          result
        }
      })
    }

    const mainNumbers = line.numbers
      .filter((number) => number.kind === 'MAIN')
      .map((number) => number.value)
    const starNumbers = line.numbers
      .filter((number) => number.kind === 'STAR')
      .map((number) => number.value)

    const mainMatches = mainNumbers.filter((value) =>
      result.numbers.includes(value)
    ).length
    const starsMatches = result.stars
      ? starNumbers.filter((value) => result.stars?.includes(value)).length
      : 0

    return NextResponse.json({
      data: {
        status: 'COMPROBADO',
        matches: {
          main: mainMatches,
          stars: starsMatches
        },
        result
      }
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al verificar.' },
      { status: 500 }
    )
  }
}
