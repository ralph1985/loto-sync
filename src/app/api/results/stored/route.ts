import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

type DrawType = 'PRIMITIVA' | 'EUROMILLONES'

const normalizeGame = (value?: string): DrawType | null => {
  const raw = (value ?? '').trim().toUpperCase()
  if (raw === 'PRIMITIVA' || raw === 'LA_PRIMITIVA') return 'PRIMITIVA'
  if (raw === 'EUROMILLONES') return 'EUROMILLONES'
  return null
}

const toNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) =>
      typeof item === 'number'
        ? item
        : typeof item === 'string'
          ? Number.parseInt(item, 10)
          : NaN
    )
    .filter((item) => Number.isFinite(item))
}

const parsePayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return {
      drawDate: null as string | null,
      numbers: [] as number[],
      stars: [] as number[],
      complementario: null as number | null,
      reintegro: null as number | null
    }
  }

  const root = payload as Record<string, unknown>
  const data =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root
  const resultData =
    data.resultData && typeof data.resultData === 'object' && !Array.isArray(data.resultData)
      ? (data.resultData as Record<string, unknown>)
      : null

  const complementarioRaw = resultData?.complementario
  const reintegroRaw = resultData?.reintegro

  const complementario =
    typeof complementarioRaw === 'number'
      ? complementarioRaw
      : typeof complementarioRaw === 'string'
        ? Number.parseInt(complementarioRaw, 10)
        : null
  const reintegro =
    typeof reintegroRaw === 'number'
      ? reintegroRaw
      : typeof reintegroRaw === 'string'
        ? Number.parseInt(reintegroRaw, 10)
        : null

  return {
    drawDate:
      typeof data.drawDate === 'string'
        ? data.drawDate
        : typeof data.date === 'string'
          ? data.date
          : null,
    numbers: [...new Set([...toNumberArray(data.numbers), ...toNumberArray(data.combination)])],
    stars: [
      ...new Set([
        ...toNumberArray(data.stars),
        ...toNumberArray(data.estrellas),
        ...toNumberArray(resultData?.stars),
        ...toNumberArray(resultData?.estrellas)
      ])
    ],
    complementario: Number.isFinite(complementario as number) ? complementario : null,
    reintegro: Number.isFinite(reintegro as number) ? reintegro : null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const gameParam = searchParams.get('game')
  const game = gameParam ? normalizeGame(gameParam) : null
  if (gameParam && !game) {
    return NextResponse.json(
      { error: 'game debe ser PRIMITIVA o EUROMILLONES.' },
      { status: 400 }
    )
  }

  const cacheEntries = await prisma.resultCache.findMany({
    where: game ? { game } : undefined,
    orderBy: [{ drawDate: 'desc' }, { fetchedAt: 'desc' }],
    take: 200
  })

  const data = cacheEntries.map((entry) => {
    const parsed = parsePayload(entry.payload)
    return {
      id: entry.id,
      game: entry.game,
      drawDate:
        parsed.drawDate ??
        (entry.drawDate ? entry.drawDate.toISOString().slice(0, 10) : null),
      numbers: parsed.numbers,
      stars: parsed.stars,
      complementario: parsed.complementario,
      reintegro: parsed.reintegro,
      fetchedAt: entry.fetchedAt.toISOString()
    }
  })

  return NextResponse.json({ data })
}
