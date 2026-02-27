import { NextResponse } from 'next/server'

import { ApiAuthError, requireSessionUser } from '@/lib/auth'
import { fetchLatestResult } from '@/lib/results-client'

const allowedGames = ['PRIMITIVA', 'EUROMILLONES'] as const

export async function GET(request: Request) {
  try {
    await requireSessionUser()
    const { searchParams } = new URL(request.url)
    const game = searchParams.get('game')

    if (!game || !allowedGames.includes(game as typeof allowedGames[number])) {
      return NextResponse.json(
        { error: 'game debe ser PRIMITIVA o EUROMILLONES.' },
        { status: 400 }
      )
    }

    const result = await fetchLatestResult(game as 'PRIMITIVA' | 'EUROMILLONES')
    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al consultar resultados.' },
      { status: 500 }
    )
  }
}
