type DrawType = 'PRIMITIVA' | 'EUROMILLONES'

export type NormalizedResult = {
  game: DrawType
  drawDate: string
  numbers: number[]
  stars?: number[]
  source: 'loteriasapi'
}

import { prisma } from '@/lib/prisma'

type CacheEntry = {
  expiresAt: number
  data: NormalizedResult
}

const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_RATE_LIMIT_MS = 30 * 1000
const cache = new Map<string, CacheEntry>()
const rateLimit = new Map<string, number>()

const GAME_MAP: Record<DrawType, string> = {
  PRIMITIVA: 'primitiva',
  EUROMILLONES: 'euromillones'
}

type RawResultPayload = {
  data?: {
    date?: string
    drawDate?: string
    numbers?: unknown[]
    stars?: unknown[]
  }
  date?: string
  drawDate?: string
  numbers?: unknown[]
  stars?: unknown[]
}

const normalizeResult = (
  game: DrawType,
  payload: RawResultPayload
): NormalizedResult => {
  const data = payload.data ?? payload
  const drawDateRaw = data.date ?? data.drawDate
  const drawDate =
    typeof drawDateRaw === 'string' ? drawDateRaw : new Date().toISOString()
  const numbers = Array.isArray(data.numbers)
    ? data.numbers.filter((value): value is number => typeof value === 'number')
    : []
  const stars = Array.isArray(data.stars)
    ? data.stars.filter((value): value is number => typeof value === 'number')
    : []

  return {
    game,
    drawDate,
    numbers,
    stars: stars.length > 0 ? stars : undefined,
    source: 'loteriasapi'
  }
}

export const fetchLatestResult = async (
  game: DrawType
): Promise<NormalizedResult> => {
  const cached = cache.get(game)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const apiKey = process.env.LOTERIAS_API_KEY
  if (!apiKey) {
    throw new Error('LOTERIAS_API_KEY no configurada.')
  }

  const dbCached = await prisma.resultCache.findFirst({
    where: {
      game
    },
    orderBy: { fetchedAt: 'desc' }
  })

  if (dbCached) {
    const isFresh = Date.now() - dbCached.fetchedAt.getTime() < CACHE_TTL_MS
    if (isFresh) {
      const normalized = normalizeResult(game, dbCached.payload)
      cache.set(game, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL_MS
      })
      return normalized
    }
  }

  const lastRequest = rateLimit.get(game)
  if (lastRequest && Date.now() - lastRequest < CACHE_RATE_LIMIT_MS) {
    if (dbCached) {
      const normalized = normalizeResult(game, dbCached.payload)
      cache.set(game, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL_MS
      })
      return normalized
    }
  }

  rateLimit.set(game, Date.now())

  const baseUrl = process.env.LOTERIAS_API_BASE || 'https://api.loteriasapi.com/api/v1'
  const response = await fetch(
    `${baseUrl}/results/${GAME_MAP[game]}/latest`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    }
  )

  if (!response.ok) {
    throw new Error('No se pudo obtener el resultado.')
  }

  const payload = await response.json()
  const normalized = normalizeResult(game, payload)

  const drawDateValue = normalized.drawDate ? new Date(normalized.drawDate) : null
  await prisma.resultCache.upsert({
    where: {
      game_drawDate: {
        game,
        drawDate: drawDateValue
      }
    },
    update: {
      payload,
      fetchedAt: new Date()
    },
    create: {
      game,
      drawDate: drawDateValue,
      payload,
      fetchedAt: new Date()
    }
  })

  cache.set(game, {
    data: normalized,
    expiresAt: Date.now() + CACHE_TTL_MS
  })

  return normalized
}
