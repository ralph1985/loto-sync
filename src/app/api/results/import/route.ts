import { NextResponse } from 'next/server'

import { importResults, type ImportResultInput } from '@/lib/results-client'

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

const validateResults = (items: ImportPayload['results']) => {
  const issues: string[] = []
  const normalized: ImportResultInput[] = []

  ;(items ?? []).forEach((item, index) => {
    const prefix = `results[${index}]`
    const date = item?.date?.trim()
    if (!date || !isValidDate(date)) {
      issues.push(`${prefix}.date no es valida (YYYY-MM-DD).`)
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

  const { issues, normalized } = validateResults(payload.results)
  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'Validacion fallida.', issues },
      { status: 400 }
    )
  }

  const imported = await importResults(game, normalized)
  return NextResponse.json({
    data: {
      game,
      imported
    }
  })
}
