import { NextResponse } from 'next/server'

import { fetchLatestResult } from '@/lib/results-client'

const allowedGames = ['PRIMITIVA', 'EUROMILLONES'] as const

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const game = searchParams.get('game')

  if (!game || !allowedGames.includes(game as typeof allowedGames[number])) {
    return NextResponse.json(
      { error: 'game debe ser PRIMITIVA o EUROMILLONES.' },
      { status: 400 }
    )
  }

  try {
    const result = await fetchLatestResult(game as 'PRIMITIVA' | 'EUROMILLONES')
    return NextResponse.json({ data: result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al consultar resultados.' },
      { status: 500 }
    )
  }
}
