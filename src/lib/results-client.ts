type DrawType = 'PRIMITIVA' | 'EUROMILLONES'

export type NormalizedResult = {
  game: DrawType
  drawDate: string
  numbers: number[]
  stars?: number[]
  source: 'local-db'
}

export type ImportResultInput = {
  date: string
  numbers: number[]
  stars?: number[]
  complementario?: number | null
  reintegro?: number | null
}

import { Prisma } from '@prisma/client'
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

const asRawResultPayload = (value: Prisma.JsonValue): RawResultPayload => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? (parsed as RawResultPayload) : {}
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' ? (value as unknown as RawResultPayload) : {}
}

type RawResultPayload = {
  success?: boolean
  timestamp?: string
  data?:
    | {
        date?: string
        drawDate?: string
        numbers?: unknown[]
        stars?: unknown[]
        combination?: unknown[]
        resultData?: {
          estrellas?: unknown[]
          stars?: unknown[]
        }
        [key: string]: unknown
      }
    | Array<Record<string, unknown>>
    | null
  date?: string
  drawDate?: string
  numbers?: unknown[]
  stars?: unknown[]
  combination?: unknown[]
  resultData?: {
    estrellas?: unknown[]
    stars?: unknown[]
  }
  [key: string]: unknown
}

const coerceNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item: (typeof value)[number]) =>
      typeof item === 'number'
        ? item
        : typeof item === 'string'
          ? Number.parseInt(item, 10)
          : NaN
    )
    .filter((item) => Number.isFinite(item))
}

const pickResultObject = (payload: RawResultPayload): Record<string, unknown> | null => {
  const data = payload.data
  if (Array.isArray(data)) {
    return (data[0] as Record<string, unknown>) ?? null
  }
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>
  }
  if (Array.isArray(payload as unknown as unknown[])) {
    return ((payload as unknown as unknown[])[0] as Record<string, unknown>) ?? null
  }
  return payload as Record<string, unknown>
}

const normalizeResult = (
  game: DrawType,
  payload: RawResultPayload,
  options?: {
    fallbackDrawDate?: string
  }
): NormalizedResult => {
  const data = pickResultObject(payload)
  const drawDateRaw = (data?.date as string | undefined) ?? (data?.drawDate as string | undefined)
  const drawDate =
    typeof drawDateRaw === 'string'
      ? drawDateRaw
      : options?.fallbackDrawDate ?? new Date().toISOString()

  const resultData = (data?.resultData ?? {}) as Record<string, unknown>
  const numbers = [
    ...coerceNumberArray(data?.numbers),
    ...coerceNumberArray(data?.combination),
    ...coerceNumberArray(resultData.numbers),
    ...coerceNumberArray(resultData.combination)
  ]
  const uniqueNumbers = [...new Set(numbers)]

  const stars = [
    ...coerceNumberArray(data?.stars),
    ...coerceNumberArray(data?.estrellas),
    ...coerceNumberArray(resultData.stars),
    ...coerceNumberArray(resultData.estrellas)
  ]
  const uniqueStars = [...new Set(stars)]

  return {
    game,
    drawDate,
    numbers: uniqueNumbers,
    stars: uniqueStars.length > 0 ? uniqueStars : undefined,
    source: 'local-db'
  }
}

export const fetchLatestResult = async (
  game: DrawType
): Promise<NormalizedResult> => {
  const cacheKey = `${game}:latest`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const dbCached = await prisma.resultCache.findFirst({
    where: {
      game
    },
    orderBy: { fetchedAt: 'desc' }
  })

  if (dbCached) {
    const normalized = normalizeResult(game, asRawResultPayload(dbCached.payload))
    if (normalized.numbers.length > 0) {
      cache.set(cacheKey, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL_MS
      })
      return normalized
    }
  }

  const lastRequest = rateLimit.get(game)
  if (lastRequest && Date.now() - lastRequest < CACHE_RATE_LIMIT_MS) {
    if (dbCached) {
      const normalized = normalizeResult(game, asRawResultPayload(dbCached.payload))
      cache.set(cacheKey, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL_MS
      })
      return normalized
    }
  }

  rateLimit.set(game, Date.now())
  return {
    game,
    drawDate: new Date().toISOString(),
    numbers: [],
    source: 'local-db'
  }
}

const toDateOnly = (value: string) => new Date(value).toISOString().slice(0, 10)
const toDayStart = (value: string) => new Date(`${value}T00:00:00.000Z`)

const findCacheForDrawDate = async (
  game: DrawType,
  drawDate: string
) => {
  const dayStart = new Date(`${drawDate}T00:00:00.000Z`)
  const dayEnd = new Date(`${drawDate}T23:59:59.999Z`)

  return prisma.resultCache.findFirst({
    where: {
      game,
      drawDate: {
        gte: dayStart,
        lte: dayEnd
      }
    },
    orderBy: { fetchedAt: 'desc' }
  })
}

export const fetchResultForDrawDate = async (
  game: DrawType,
  drawDate: string
): Promise<NormalizedResult> => {
  const cacheKey = `${game}:${drawDate}`
  const memoryCached = cache.get(cacheKey)
  if (memoryCached && memoryCached.expiresAt > Date.now()) {
    return memoryCached.data
  }

  const dbCached = await findCacheForDrawDate(game, drawDate)
  if (dbCached) {
    const normalized = normalizeResult(game, asRawResultPayload(dbCached.payload), {
      fallbackDrawDate: drawDate
    })
    if (normalized.numbers.length > 0) {
      cache.set(cacheKey, {
        data: normalized,
        expiresAt: Date.now() + CACHE_TTL_MS
      })
      return normalized
    }
  }

  return {
    game,
    drawDate,
    numbers: [],
    source: 'local-db'
  }
}

export const importResults = async (
  game: DrawType,
  items: ImportResultInput[]
) => {
  let imported = 0

  for (const item of items) {
    const drawDate = toDateOnly(item.date)
    const payload = {
      success: true,
      data: {
        game: {
          slug: GAME_MAP[game],
          name: game === 'PRIMITIVA' ? 'La Primitiva' : 'Euromillones'
        },
        drawDate,
        combination: item.numbers,
        stars: item.stars ?? [],
        resultData: {
          complementario: item.complementario ?? null,
          reintegro: item.reintegro ?? null
        }
      },
      source: 'manual-json'
    }

    await prisma.resultCache.upsert({
      where: {
        game_drawDate: {
          game,
          drawDate: toDayStart(drawDate)
        }
      },
      update: {
        payload: payload as Prisma.InputJsonValue,
        fetchedAt: new Date()
      },
      create: {
        game,
        drawDate: toDayStart(drawDate),
        payload: payload as Prisma.InputJsonValue,
        fetchedAt: new Date()
      }
    })

    cache.delete(`${game}:${drawDate}`)
    cache.delete(`${game}:latest`)
    imported += 1
  }

  return imported
}
